// content/content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "SN_FETCH") return false;
  (async () => {
    try {
      const headers = { Accept: "application/json" };
      let token = msg.token || null;
      let source = token ? "cookie-from-background" : null;
      if (!token && typeof g_ck === "string" && g_ck) {
        token = g_ck;
        source = "page-global";
      }
      if (token) headers["X-UserToken"] = token;
      // Reads default to GET with no body; writes (PATCH) carry a JSON body and
      // need the Content-Type header. `method`/`body` are absent for every
      // existing read caller, so this stays backward-compatible.
      const method = msg.method || "GET";
      const body = msg.body;
      if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
      const res = await fetch(msg.url, {
        method,
        credentials: "include",
        headers,
        ...(body !== undefined && body !== null ? { body } : {})
      });
      const text = await res.text();
      const responseHeaders = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });
      sendResponse({
        ok: true,
        status: res.status,
        text,
        headers: responseHeaders,
        tokenFound: Boolean(token),
        tokenSource: source
      });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});
