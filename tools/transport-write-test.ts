import test from "node:test";
import assert from "node:assert/strict";

import { createSmartTransport } from "../data/datasource/sn-transport.ts";

const URL_UNDER_TEST = "https://x.service-now.com/api/now/table/sc_task/abc123";

/**
 * Installs a fake `chrome` whose tab relay (`tabs.sendMessage`) records the
 * message it received and returns a canned OK reply. Lets the tests assert
 * exactly what the transport forwarded to the content script.
 */
function installFakeChrome(record: { last?: Record<string, unknown> }) {
  const fakeChrome = {
    tabs: {
      query: async () => [{ id: 1, lastAccessed: 1 }],
      sendMessage: async (_tabId: number, message: Record<string, unknown>) => {
        record.last = message;
        return { ok: true, status: 200, text: "{}", headers: {}, tokenFound: true };
      }
    },
    cookies: { get: (_d: unknown, cb: (c: unknown) => void) => cb({ value: "tok" }) },
    scripting: { executeScript: async () => [{ result: "tok" }] }
  };
  Object.defineProperty(globalThis, "chrome", {
    value: fakeChrome,
    configurable: true,
    writable: true
  });
}

test("GET relay message carries method GET and no body (unchanged behavior)", async () => {
  const rec: { last?: Record<string, unknown> } = {};
  installFakeChrome(rec);
  const transport = createSmartTransport(50);
  const result = await transport(URL_UNDER_TEST);
  assert.equal(result.ok, true);
  assert.equal(result.via, "relay");
  assert.equal(rec.last?.type, "SN_FETCH");
  assert.equal(rec.last?.method, "GET");
  assert.equal(rec.last?.body, undefined);
  assert.equal(rec.last?.token, "tok");
});

test("PATCH relay message carries method PATCH and the JSON body", async () => {
  const rec: { last?: Record<string, unknown> } = {};
  installFakeChrome(rec);
  const transport = createSmartTransport(50);
  const body = JSON.stringify({ work_notes: "hello" });
  const result = await transport(URL_UNDER_TEST, { method: "PATCH", body });
  assert.equal(result.ok, true);
  assert.equal(result.via, "relay");
  assert.equal(rec.last?.method, "PATCH");
  assert.equal(rec.last?.body, body);
});

test("PATCH direct-fetch fallback sets method, body, and Content-Type", async () => {
  // Relay throws -> transport falls through to a direct fetch. Capture the init.
  const fakeChrome = {
    tabs: {
      query: async () => [{ id: 1, lastAccessed: 1 }],
      sendMessage: async () => {
        throw new Error("relay unavailable");
      }
    },
    cookies: { get: (_d: unknown, cb: (c: unknown) => void) => cb({ value: "tok" }) },
    scripting: { executeScript: async () => [{ result: "tok" }] }
  };
  Object.defineProperty(globalThis, "chrome", {
    value: fakeChrome,
    configurable: true,
    writable: true
  });

  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedInit = init;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const transport = createSmartTransport(50);
    const body = JSON.stringify({ comments: "hi" });
    const result = await transport(URL_UNDER_TEST, { method: "PATCH", body });
    assert.equal(result.ok, true);
    assert.equal(result.via, "direct");
    assert.equal(capturedInit?.method, "PATCH");
    assert.equal(capturedInit?.body, body);
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-UserToken"], "tok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET direct-fetch fallback sends no body and no Content-Type", async () => {
  const fakeChrome = {
    tabs: {
      query: async () => [{ id: 1, lastAccessed: 1 }],
      sendMessage: async () => {
        throw new Error("relay unavailable");
      }
    },
    cookies: { get: (_d: unknown, cb: (c: unknown) => void) => cb({ value: "tok" }) },
    scripting: { executeScript: async () => [{ result: "tok" }] }
  };
  Object.defineProperty(globalThis, "chrome", {
    value: fakeChrome,
    configurable: true,
    writable: true
  });

  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedInit = init;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const transport = createSmartTransport(50);
    await transport(URL_UNDER_TEST);
    assert.equal(capturedInit?.method, "GET");
    assert.equal(capturedInit?.body, undefined);
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
