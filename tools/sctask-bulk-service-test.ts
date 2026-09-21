import test from "node:test";
import assert from "node:assert/strict";

import { Container } from "../di/container.ts";
import { SCTASK_BULK_SERVICE, SN_REMOTE_FACTORY } from "../di/tokens.ts";
import { FakeSnRemote } from "../data/datasource/sn-remote.ts";
import { SctaskBulkService, SCTASK_LIST_FIELDS } from "../services/sctask-bulk-service.ts";

const INSTANCE = "https://dev.service-now.com";

function harness(remote: FakeSnRemote): SctaskBulkService {
  const c = new Container();
  c.registerValue(SN_REMOTE_FACTORY, () => remote);
  c.registerClass(SCTASK_BULK_SERVICE, SctaskBulkService, { singleton: true });
  return c.resolve(SCTASK_BULK_SERVICE);
}

/** A raw sc_task record in the display+value shape the Table API returns. */
function rawTask(sysId: string, number: string, short: string, state: string, workNotes = "") {
  return {
    sys_id: { value: sysId, display_value: sysId },
    number: { value: number, display_value: number },
    short_description: { value: short, display_value: short },
    state: { value: "1", display_value: state },
    assignment_group: { value: "g1", display_value: "Service Desk" },
    assigned_to: { value: "u1", display_value: "Alice" },
    sys_updated_on: { value: "2026-09-01 10:00:00", display_value: "2026-09-01 10:00:00" },
    work_notes: { value: workNotes, display_value: workNotes }
  };
}

test('scope "me" queries assigned_to=<userId>^active=true and normalizes rows', async () => {
  const remote = new FakeSnRemote();
  const query = "assigned_to=u1^active=true";
  remote.sctasks[query] = [
    rawTask(
      "s1",
      "SCTASK0001",
      "Reset VPN",
      "Open",
      "20-09-2026 12:03:07 - Abbas Nagoor Kani (Work notes)\nlatest note here"
    )
  ];
  const svc = harness(remote);

  const rows = await svc.listAssigned({ instanceUrl: INSTANCE, scope: "me", currentUserId: "u1" });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    sysId: "s1",
    number: "SCTASK0001",
    shortDescription: "Reset VPN",
    state: "Open",
    assignmentGroup: "Service Desk",
    assignedTo: "Alice",
    updatedOn: "2026-09-01 10:00:00",
    lastWorkNote: "latest note here",
    workNotesHistory: [
      {
        header: "20-09-2026 12:03:07 - Abbas Nagoor Kani (Work notes)",
        when: "20-09-2026 12:03:07",
        author: "Abbas Nagoor Kani",
        body: "latest note here"
      }
    ],
    hasWorkNote: true
  });
  assert.deepEqual(remote.calls.at(-1), {
    method: "listSctasks",
    args: [query, SCTASK_LIST_FIELDS]
  });
});

test("list parses work_notes: no note -> lastWorkNote empty, hasWorkNote false", async () => {
  const remote = new FakeSnRemote();
  const query = "assigned_to=u1^active=true";
  remote.sctasks[query] = [rawTask("s1", "SCTASK0001", "x", "Open", "")];
  const svc = harness(remote);
  const rows = await svc.listAssigned({ instanceUrl: INSTANCE, scope: "me", currentUserId: "u1" });
  assert.equal(rows[0].lastWorkNote, "");
  assert.equal(rows[0].hasWorkNote, false);
});

test('scope "me" resolves the current user id from the remote when not provided', async () => {
  const remote = new FakeSnRemote();
  remote.userId = "u9";
  remote.sctasks["assigned_to=u9^active=true"] = [rawTask("s2", "SCTASK0002", "x", "WIP")];
  const svc = harness(remote);

  const rows = await svc.listAssigned({ instanceUrl: INSTANCE, scope: "me" });
  assert.equal(rows[0].number, "SCTASK0002");
  assert.ok(remote.calls.some((c) => c.method === "currentUserId"));
});

test('scope "groups" queries assignment_groupIN<ids>^active=true', async () => {
  const remote = new FakeSnRemote();
  remote.userGroupIds["u1"] = ["g1", "g2"];
  const query = "assignment_groupINg1,g2^active=true";
  remote.sctasks[query] = [rawTask("s3", "SCTASK0003", "Onboard", "Open")];
  const svc = harness(remote);

  const rows = await svc.listAssigned({
    instanceUrl: INSTANCE,
    scope: "groups",
    currentUserId: "u1"
  });
  assert.equal(rows[0].number, "SCTASK0003");
  assert.deepEqual(remote.calls.at(-1), {
    method: "listSctasks",
    args: [query, SCTASK_LIST_FIELDS]
  });
});

test('scope "groups" returns [] without listing when the user has no groups', async () => {
  const remote = new FakeSnRemote();
  remote.userGroupIds["u1"] = [];
  const svc = harness(remote);

  const rows = await svc.listAssigned({
    instanceUrl: INSTANCE,
    scope: "groups",
    currentUserId: "u1"
  });
  assert.deepEqual(rows, []);
  assert.ok(!remote.calls.some((c) => c.method === "listSctasks"));
});

test("listAssigned throws when no current user can be determined", async () => {
  const remote = new FakeSnRemote();
  remote.userId = null;
  const svc = harness(remote);
  await assert.rejects(
    svc.listAssigned({ instanceUrl: INSTANCE, scope: "me" }),
    /could not determine the current servicenow user/i
  );
});

test("listAssigned requires an instance URL", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(svc.listAssigned({ instanceUrl: "", scope: "me" }), /instance URL/i);
});

test("bulkUpdate writes each selected SCTASK sequentially and summarizes success", async () => {
  const remote = new FakeSnRemote();
  const svc = harness(remote);
  const seen: { sysId: string; ok: boolean }[] = [];

  const summary = await svc.bulkUpdate({
    instanceUrl: INSTANCE,
    sysIds: ["s1", "s2", "s3"],
    workNotes: "bulk note",
    onRow: (r) => seen.push({ sysId: r.sysId, ok: r.ok })
  });

  assert.equal(summary.succeeded, 3);
  assert.equal(summary.failed, 0);
  // per-row callback fired in input order
  assert.deepEqual(
    seen.map((s) => s.sysId),
    ["s1", "s2", "s3"]
  );
  // each write appended the work note to sc_task
  assert.deepEqual(
    remote.writes.map((w) => ({ sysId: w.sysId, fields: w.fields })),
    [
      { sysId: "s1", fields: { work_notes: "bulk note" } },
      { sysId: "s2", fields: { work_notes: "bulk note" } },
      { sysId: "s3", fields: { work_notes: "bulk note" } }
    ]
  );
});

test("bulkUpdate continues past a failed row and reports it in the summary", async () => {
  const remote = new FakeSnRemote();
  remote.writeErrors["s2"] = new Error("Auth error 403");
  const svc = harness(remote);
  const seen: string[] = [];

  const summary = await svc.bulkUpdate({
    instanceUrl: INSTANCE,
    sysIds: ["s1", "s2", "s3"],
    comments: "hi",
    onRow: (r) => seen.push(`${r.sysId}:${r.ok ? "ok" : "fail"}`)
  });

  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  assert.deepEqual(seen, ["s1:ok", "s2:fail", "s3:ok"]);
  const failed = summary.results.find((r) => r.sysId === "s2");
  assert.equal(failed?.ok, false);
  assert.match(failed?.error ?? "", /403/);
  // s1 and s3 were still written despite s2 failing
  assert.deepEqual(
    remote.writes.map((w) => w.sysId),
    ["s1", "s3"]
  );
});

test("bulkUpdate sends both comment and work note when both provided", async () => {
  const remote = new FakeSnRemote();
  const svc = harness(remote);
  await svc.bulkUpdate({
    instanceUrl: INSTANCE,
    sysIds: ["s1"],
    comments: "cust",
    workNotes: "internal"
  });
  assert.deepEqual(remote.writes[0].fields, { comments: "cust", work_notes: "internal" });
});

test("bulkUpdate rejects when no SCTASK is selected", async () => {
  const svc = harness(new FakeSnRemote());
  await assert.rejects(
    svc.bulkUpdate({ instanceUrl: INSTANCE, sysIds: [], workNotes: "x" }),
    /at least one sctask/i
  );
});

test("bulkUpdate rejects when both comment and work note are empty", async () => {
  const remote = new FakeSnRemote();
  const svc = harness(remote);
  await assert.rejects(
    svc.bulkUpdate({ instanceUrl: INSTANCE, sysIds: ["s1"], comments: "  ", workNotes: "" }),
    /comment or a work note/i
  );
  assert.equal(remote.writes.length, 0);
});

test("bulkUpdate items-path writes each ticket's OWN text", async () => {
  const remote = new FakeSnRemote();
  const svc = harness(remote);
  await svc.bulkUpdate({
    instanceUrl: INSTANCE,
    sysIds: [],
    items: [
      { sysId: "s1", comments: "c1", workNotes: "w1" },
      { sysId: "s2", workNotes: "w2only" }
    ]
  });
  assert.deepEqual(remote.writes, [
    { table: "sc_task", sysId: "s1", fields: { comments: "c1", work_notes: "w1" } },
    { table: "sc_task", sysId: "s2", fields: { work_notes: "w2only" } }
  ]);
});

test("bulkUpdate items-path reports partial failure and continues", async () => {
  const remote = new FakeSnRemote();
  remote.writeErrors["s2"] = new Error("Auth error 403");
  const svc = harness(remote);
  const summary = await svc.bulkUpdate({
    instanceUrl: INSTANCE,
    sysIds: [],
    items: [
      { sysId: "s1", comments: "a" },
      { sysId: "s2", comments: "b" },
      { sysId: "s3", comments: "c" }
    ]
  });
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  assert.deepEqual(
    remote.writes.map((w) => w.sysId),
    ["s1", "s3"]
  );
});

test("bulkUpdate items-path drops items with no text and rejects when all empty", async () => {
  const remote = new FakeSnRemote();
  const svc = harness(remote);
  await assert.rejects(
    svc.bulkUpdate({
      instanceUrl: INSTANCE,
      sysIds: [],
      items: [{ sysId: "s1", comments: "  ", workNotes: "" }]
    }),
    /nothing to post/i
  );
  assert.equal(remote.writes.length, 0);
});
