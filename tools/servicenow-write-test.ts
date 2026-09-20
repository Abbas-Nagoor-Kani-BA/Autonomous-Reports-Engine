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

test("fetchLastWorkNote reads work_notes off the record (sys_journal_field is ACL-blocked)", async () => {
  const { transport, calls } = fakeTransport(() => ({
    json: { result: { work_notes: "2026-01-01 00:00:00 - A B (Work notes)\nthe latest note" } }
  }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  const note = await client.fetchLastWorkNote("abc123");

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/api\/now\/table\/sc_task\/abc123/);
  assert.match(calls[0].url, /sysparm_fields=work_notes/);
  assert.match(calls[0].url, /sysparm_display_value=true/);
  assert.equal(note, "the latest note");
});

test("fetchLastWorkNote returns null when the record has no work note", async () => {
  const { transport } = fakeTransport(() => ({ json: { result: { work_notes: "" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  assert.equal(await client.fetchLastWorkNote("abc123"), null);
});

test("updateRecord surfaces a 4xx as a clear error", async () => {
  const { transport } = fakeTransport(() => ({ status: 403, json: { error: { message: "ACL" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  await assert.rejects(() => client.updateRecord("sc_task", "abc", { work_notes: "x" }), /403/);
});

test("currentUserId reads result.user_sys_id (real current_user payload shape)", async () => {
  const { transport } = fakeTransport(() => ({
    json: {
      result: {
        user_avatar: null,
        user_sys_id: "43a3c7713bdfe610d5d5232a85e45a0b",
        user_name: "abbas.nagoor.kani@ba.com",
        user_display_name: "Abbas Nagoor Kani",
        user_initials: "AK"
      }
    }
  }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  const id = await client.currentUserId();
  assert.equal(id, "43a3c7713bdfe610d5d5232a85e45a0b");
});

test("currentUserId still reads the legacy result.userID shape", async () => {
  const { transport } = fakeTransport(() => ({ json: { result: { userID: "legacy123" } } }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  assert.equal(await client.currentUserId(), "legacy123");
});

test("parseLastWorkNote extracts the newest entry from a concatenated work_notes value", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  const value = [
    "2026-09-20 08:00:00 - Abbas Nagoor Kani (Work notes)",
    "newest note line one",
    "newest note line two",
    "",
    "2026-09-19 09:30:00 - Someone Else (Work notes)",
    "older note"
  ].join("\n");
  assert.equal(parseLastWorkNote(value), "newest note line one\nnewest note line two");
});

test("parseLastWorkNote handles a single entry", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  const value = "2026-09-20 08:00:00 - A B (Work notes)\njust one note";
  assert.equal(parseLastWorkNote(value), "just one note");
});

test("parseLastWorkNote returns null for empty/whitespace", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  assert.equal(parseLastWorkNote(""), null);
  assert.equal(parseLastWorkNote("   \n  "), null);
  assert.equal(parseLastWorkNote(null), null);
});

test("parseLastWorkNote treats an unheadered value as a single note", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  assert.equal(parseLastWorkNote("plain text with no header"), "plain text with no header");
});

test("fetchLastWorkNote reads work_notes off the record with display value", async () => {
  const { transport, calls } = fakeTransport(() => ({
    json: {
      result: {
        work_notes: "2026-09-20 08:00:00 - A B (Work notes)\nthe latest note"
      }
    }
  }));
  const client = new ServiceNowClient("https://x.service-now.com", { transport });
  const note = await client.fetchLastWorkNote("6d3753833b7ac3100a41910f23e45afe");
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/api\/now\/table\/sc_task\/6d3753833b7ac3100a41910f23e45afe/);
  assert.match(calls[0].url, /sysparm_display_value=true/);
  assert.match(calls[0].url, /sysparm_fields=work_notes/);
  assert.equal(note, "the latest note");
});

test("parseLastWorkNote extracts newest entry from the real DD-MM-YYYY format", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  const value = [
    "20-09-2026 12:03:07 - Abbas Nagoor Kani (Work notes)",
    "Newest update: deployed to UAT, testing in progress.",
    "",
    "18-09-2026 14:45:00 - Abbas Nagoor Kani (Work notes)",
    "Older note that must not be included.",
    "",
    "25-08-2026 12:35:57 - Jagan Shrinivasan (Work notes)",
    "Reassigning internally."
  ].join("\n");
  assert.equal(parseLastWorkNote(value), "Newest update: deployed to UAT, testing in progress.");
});

test("parseLastWorkNote handles DD-MM-YYYY single entry", async () => {
  const { parseLastWorkNote } = await import("../lib/servicenow.ts");
  const value = "24-08-2026 12:14:45 - Challa Sai Krishna (Work notes)\nAssigning to the team";
  assert.equal(parseLastWorkNote(value), "Assigning to the team");
});
