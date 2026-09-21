import { MSG } from "../../lib/keys.ts";

export type FetchResult = {
  ok: boolean;
  status?: number;
  text?: string;
  headers?: Record<string, string>;
  via?: string;
  hadToken?: boolean;
  tokenSource?: string | null;
  error?: string;
};

/**
 * A ServiceNow request. `method`/`body` default to a GET with no body, so every
 * existing read caller keeps working unchanged. Writes (PATCH) pass a JSON
 * `body`; the transport and the content-script relay both forward it along with
 * the `Content-Type: application/json` and `X-UserToken` (CSRF) headers that
 * ServiceNow requires for a write.
 */
export type RequestOpts = {
  attempt?: number;
  method?: "GET" | "PATCH" | "POST";
  /** Pre-serialized JSON string for the request body (write requests only). */
  body?: string;
};

export type Transport = (url: string, opts?: RequestOpts) => Promise<FetchResult>;

const TOKEN_TTL_MS = 8 * 60 * 1000;
const MAX_AUTH_RETRIES = 2;
export const RELAY_TIMEOUT_MS = 15000;

function sendMessageWithTimeout(tabId: number, message: unknown, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Relay to ServiceNow tab timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    Promise.resolve(chrome.tabs.sendMessage(tabId, message)).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Session-authenticated transport for ServiceNow.
 *
 * The order is load-bearing and was arrived at the hard way (see the auth chain
 * in AGENTS.md):
 *
 * 1. an open tab on the instance origin — without one, session auth is
 *    impossible, so fail fast with a message that says so
 * 2. CSRF token from the `g_ck` cookie, else a MAIN-world injection reading the
 *    page global (content scripts run in an isolated world and cannot see it)
 * 3. relay the request through that tab's content script, so cookies are
 *    first-party and not blocked as third-party
 * 4. a direct fetch from the worker as a last resort
 */
export function createSmartTransport(relayTimeoutMs = RELAY_TIMEOUT_MS): Transport {
  let tokenCache: { value: string; source: string | null; at: number } | null = null;

  const resolveToken = async (
    origin: string,
    tab: any,
    forceFresh: boolean
  ): Promise<{ value: string | null; source: string | null }> => {
    if (!forceFresh && tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) {
      return { value: tokenCache.value, source: tokenCache.source };
    }
    let token = await getCookieToken(origin);
    let source: string | null = token ? "cookie" : null;
    if (!token && tab?.id !== undefined) {
      token = await getPageToken(tab.id);
      source = token ? "page-injection" : null;
    }
    if (token) tokenCache = { value: token, source, at: Date.now() };
    return { value: token, source };
  };

  const transport: Transport = async (url, opts = {}) => {
    const attempt = opts.attempt || 0;
    const method = opts.method || "GET";
    const body = opts.body;
    const origin = new URL(url).origin;
    const tab = await findServiceNowTab(origin);
    if (!tab) {
      return {
        ok: false,
        error: `No open tab found for ${origin}. Open your ServiceNow instance in a browser tab, log in, and keep it open while using the analyzer.`
      };
    }

    const { value: token, source } = await resolveToken(origin, tab, attempt > 0);

    try {
      const resp = await sendMessageWithTimeout(
        tab.id,
        { type: MSG.snFetch, url, token, method, body },
        relayTimeoutMs
      );
      if (resp && resp.ok) {
        if (resp.status === 401 && attempt < MAX_AUTH_RETRIES) {
          tokenCache = null;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          return transport(url, { ...opts, attempt: attempt + 1 });
        }
        return {
          ok: true,
          status: resp.status,
          text: resp.text,
          headers: resp.headers,
          via: "relay",
          hadToken: Boolean(resp.tokenFound),
          tokenSource: source
        };
      }
    } catch {
      /* fall through to the direct attempt */
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["X-UserToken"] = token;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers,
        ...(body !== undefined ? { body } : {})
      });
      const text = await res.text();
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });
      if (res.status === 401 && token && attempt < MAX_AUTH_RETRIES) {
        tokenCache = null;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        return transport(url, { ...opts, attempt: attempt + 1 });
      }
      return {
        ok: true,
        status: res.status,
        text,
        headers: responseHeaders,
        via: "direct",
        hadToken: Boolean(token),
        tokenSource: source
      };
    } catch (err) {
      return { ok: false, error: String(err), via: "direct", hadToken: Boolean(token) };
    }
  };

  return transport;
}

export async function findServiceNowTab(origin: string): Promise<any | null> {
  try {
    const tabs = await chrome.tabs.query({ url: `${origin}/*` });
    return tabs.sort((a: any, b: any) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
  } catch {
    return null;
  }
}

function getCookieToken(origin: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.cookies.get({ url: origin, name: "g_ck" }, (c: any) => resolve(c?.value || null));
    } catch {
      resolve(null);
    }
  });
}

async function getPageToken(tabId: number): Promise<string | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        try {
          return typeof window.g_ck === "string" && window.g_ck ? window.g_ck : null;
        } catch {
          return null;
        }
      }
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

/**
 * Picks a usable current-user id from the candidate sources, in priority order:
 *
 * 1. `restUserId` — the `userID` from the current-user REST endpoint
 *    (`/api/now/ui/user/current_user`), resolved over the same relay. Preferred
 *    because it is a real sys_id and needs no MAIN-world injection.
 * 2. `pageUserId` — `window.NOW.user.userID` / `window.g_user_id` page global.
 * 3. `pageUserName` — `window.NOW.user.userName` / `window.g_user` (the
 *    user_name login), used for a `sys_user` self-lookup.
 *
 * Blank/nullish candidates are skipped. Pure so the selection rule is
 * unit-testable without a live tab.
 */
export function pickUserId(candidates: {
  restUserId?: string | null;
  pageUserId?: string | null;
  pageUserName?: string | null;
  tableUserId?: string | null;
}): { id: string; source: "rest" | "g_user_id" | "g_user" | "table" } | null {
  const restUserId = String(candidates.restUserId ?? "").trim();
  if (restUserId) return { id: restUserId, source: "rest" };
  const pageUserId = String(candidates.pageUserId ?? "").trim();
  if (pageUserId) return { id: pageUserId, source: "g_user_id" };
  const pageUserName = String(candidates.pageUserName ?? "").trim();
  if (pageUserName) return { id: pageUserName, source: "g_user" };
  const tableUserId = String(candidates.tableUserId ?? "").trim();
  if (tableUserId) return { id: tableUserId, source: "table" };
  return null;
}

/**
 * Reads the current user's identity from the ServiceNow page's MAIN world.
 *
 * Mirrors `getPageToken`: content scripts run in an isolated world and cannot
 * see page globals, so a MAIN-world injection is the only way to read them.
 * Prefers the modern `window.NOW.user` object and falls back to the legacy
 * `window.g_user_id` / `window.g_user` globals. Returns whichever exist; the
 * caller decides precedence via `pickUserId`.
 */
export async function getPageUser(
  tabId: number
): Promise<{ userId: string | null; userName: string | null }> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const out: { userId: string | null; userName: string | null } = {
          userId: null,
          userName: null
        };
        const pick = (obj: any): void => {
          if (!obj || typeof obj !== "object") return;
          if (!out.userId && typeof obj.userID === "string" && obj.userID) out.userId = obj.userID;
          if (!out.userName && typeof obj.userName === "string" && obj.userName)
            out.userName = obj.userName;
        };
        try {
          const now = (window as any).NOW;
          if (now && now.user) pick(now.user);
        } catch {
          /* ignore */
        }
        try {
          // On modern releases window.g_user is a GlideUser OBJECT exposing
          // userID / userName / fullName — not a bare string.
          const gu = (window as any).g_user;
          if (gu && typeof gu === "object") pick(gu);
          else if (typeof gu === "string" && gu && !out.userName) out.userName = gu;
        } catch {
          /* ignore */
        }
        try {
          if (!out.userId && typeof window.g_user_id === "string" && window.g_user_id)
            out.userId = window.g_user_id;
        } catch {
          /* ignore */
        }
        return out;
      }
    });
    const r = results?.[0]?.result;
    return { userId: r?.userId || null, userName: r?.userName || null };
  } catch {
    return { userId: null, userName: null };
  }
}
