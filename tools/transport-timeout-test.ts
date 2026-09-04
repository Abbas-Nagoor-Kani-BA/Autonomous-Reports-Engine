import test from "node:test";
import assert from "node:assert/strict";

import { createSmartTransport, RELAY_TIMEOUT_MS } from "../data/datasource/sn-transport.ts";

const URL_UNDER_TEST = "https://x.service-now.com/api/now/table/incident";

function installFakeChrome({ sendMessage }) {
  const fakeChrome = {
    tabs: {
      query: async () => [{ id: 1, lastAccessed: 1 }],
      sendMessage
    },
    cookies: {
      get: (_details, cb) => cb({ value: "g_ck_token_value" })
    },
    scripting: {
      executeScript: async () => [{ result: "g_ck_token_value" }]
    }
  };
  Object.defineProperty(globalThis, "chrome", {
    value: fakeChrome,
    configurable: true,
    writable: true
  });
}

test("relay timeout constant is 15000ms", () => {
  assert.equal(RELAY_TIMEOUT_MS, 15000);
});

test("transport falls through to direct fetch when relay never replies", { timeout: 5000 }, async () => {
  installFakeChrome({
    sendMessage: () => new Promise(() => {})
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("direct fetch reached");
  };
  try {
    const transport = createSmartTransport(50);
    const result = await transport(URL_UNDER_TEST);
    assert.equal(result.ok, false);
    assert.equal(result.via, "direct");
    assert.match(result.error, /direct fetch reached/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transport uses relay result when sendMessage replies before timeout", { timeout: 5000 }, async () => {
  installFakeChrome({
    sendMessage: async () => ({ ok: true, status: 200, text: "{}", headers: {}, tokenFound: true })
  });
  const transport = createSmartTransport(50);
  const result = await transport(URL_UNDER_TEST);
  assert.equal(result.ok, true);
  assert.equal(result.via, "relay");
});
