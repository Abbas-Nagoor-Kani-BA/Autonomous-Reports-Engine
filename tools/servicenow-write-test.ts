import test from "node:test";
import assert from "node:assert/strict";

import { ServiceNowClient } from "../lib/servicenow.ts";

type Recorded = { url: string; method: string; body?: string };

/**
 * A fake transport that records each request and returns a scripted JSON body.
 * Mirrors the real transport result shape (`{ ok, status, text, headers }`).
 */
function fakeTransport(responder: (rec: Recorded) => { status?: number; json?: unknown }) {
  const calls: Recorded[] = [];
  const transport = async (url: string, opts?: { method?: string; body?: string }) => {
    const rec: Recorded = { url, method: opts?.method || "GET", body: opts?.body };
    calls.push(rec);
    const { status = 200, json = {} } = responder(rec);
    return {
      ok: true,
      status,
      text: JSON.stringify(json),
      headers: { "content-type": "application/json" }
    };
  };
  return { transport, calls };
}

test("updateRecord PATCHes the record with the given fields", async () => {
  const { transport, calls } = fakeTransport(() => ({
    json: { result: { sys_id: "abc", number: "SCTASK0001" } }
  }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  const out = await client.updateRecord("sc_task", "abc", { work_notes: "hi" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PATCH");
  assert.match(calls[0].url, /\/api\/now\/table\/sc_task\/abc/);
  assert.match(calls[0].url, /sysparm_fields=sys_id%2Cnumber/);
  assert.deepEqual(JSON.parse(calls[0].body as string), { work_notes: "hi" });
  assert.equal(out.number, "SCTASK0001");
});

test("updateRecord rejects an empty field set before any request", async () => {
  const { transport, calls } = fakeTransport(() => ({ json: {} }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await assert.rejects(() => client.updateRecord("sc_task", "abc", {}), /at least one field/);
  assert.equal(calls.length, 0);
});

test("updateSctaskJournals sends both comments and work_notes in one PATCH", async () => {
  const { transport, calls } = fakeTransport(() => ({ json: { result: { sys_id: "abc" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await client.updateSctaskJournals("abc", { comments: "cust", workNotes: "internal" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].body as string), {
    comments: "cust",
    work_notes: "internal"
  });
});

test("updateSctaskJournals includes only the provided field", async () => {
  const { transport, calls } = fakeTransport(() => ({ json: { result: { sys_id: "abc" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await client.updateSctaskJournals("abc", { workNotes: "only note" });
  assert.deepEqual(JSON.parse(calls[0].body as string), { work_notes: "only note" });
});

test("updateSctaskJournals rejects when neither field is provided", async () => {
  const { transport, calls } = fakeTransport(() => ({ json: {} }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await assert.rejects(
    () => client.updateSctaskJournals("abc", { comments: "   ", workNotes: "" }),
    /provide a comment or a work note/
  );
  assert.equal(calls.length, 0);
});

test("fetchLastWorkNote queries sys_journal_field ordered desc, limit 1", async () => {
  const { transport, calls } = fakeTransport(() => ({
    json: { result: [{ value: "the latest note", sys_created_on: "2026-01-01 00:00:00" }] }
  }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  const note = await client.fetchLastWorkNote("abc123");

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /sys_journal_field/);
  assert.match(calls[0].url, /element%3Dwork_notes/);
  assert.match(calls[0].url, /element_id%3Dabc123/);
  assert.match(calls[0].url, /ORDERBYDESCsys_created_on/);
  assert.match(calls[0].url, /sysparm_limit=1/);
  assert.equal(note, "the latest note");
});

test("fetchLastWorkNote returns null when there is no work note", async () => {
  const { transport } = fakeTransport(() => ({ json: { result: [] } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  assert.equal(await client.fetchLastWorkNote("abc123"), null);
});

test("updateRecord surfaces a 4xx as a clear error", async () => {
  const { transport } = fakeTransport(() => ({ status: 403, json: { error: { message: "ACL" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await assert.rejects(() => client.updateRecord("sc_task", "abc", { work_notes: "x" }), /403/);
});
