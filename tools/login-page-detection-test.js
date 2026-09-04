import test from "node:test";
import assert from "node:assert/strict";

import { ServiceNowClient } from "../lib/servicenow.ts";

const mkClient = (transport) =>
  new ServiceNowClient("https://x.service-now.com", { transport });

test("count throws login error when a 200 HTML login page is returned", async () => {
  const client = mkClient(async () => ({
    ok: true,
    status: 200,
    text: "<!DOCTYPE html><html>login</html>",
    headers: { "content-type": "text/html" }
  }));
  client.maxRetries = 0;
  await assert.rejects(
    () => client.count("incident", "active=true"),
    /Not logged in to ServiceNow \(received the login page\)/
  );
});

test("login page detected by body sniff when content-type is generic", async () => {
  const client = mkClient(async () => ({
    ok: true,
    status: 200,
    text: "  <html><body>Please sign in</body></html>",
    headers: { "content-type": "text/plain" }
  }));
  client.maxRetries = 0;
  await assert.rejects(
    () => client.count("incident", "active=true"),
    /Not logged in to ServiceNow/
  );
});

test("genuine JSON 200 is not treated as a login page", async () => {
  const client = mkClient(async () => ({
    ok: true,
    status: 200,
    text: JSON.stringify({ result: [] }),
    headers: { "content-type": "application/json", "x-total-count": "42" }
  }));
  const total = await client.count("incident", "active=true");
  assert.equal(total, 42);
});
