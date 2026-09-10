#!/usr/bin/env node
import { extractTimelines, analyzeAll, extractEventsFromListHistory } from "../core/phase2.ts";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok " : "FAIL"} ${name}${ok ? "" : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}
const base = {
  queueName: "QA Queue Alpha",
  memberNames: ["Fred Luddy", "ITIL User"],
  stateMap: { 1: "New", 2: "In Progress", 3: "On Hold", 6: "Resolved", 7: "Closed" },
  snapshotGroupName: "QA Queue Alpha"
};
const ev = (field, oldValue, newValue, at) => ({ field, oldValue, newValue, at });

console.log("== assignTime clamp to opened_at ==");
check("backdated group entry clamps to opened_at",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-03-11 10:00:00"),
    ev("assigned_to", "", "Fred Luddy", "2026-03-12 09:00:00")
  ], { ...base, openedAtUtcRaw: "2026-03-13 08:00:00" }).assignTimeUtcIso,
  "2026-03-13T08:00:00.000Z");
check("normal entry after birth untouched",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-03-14 10:00:00")
  ], { ...base, openedAtUtcRaw: "2026-03-13 08:00:00" }).assignTimeUtcIso,
  "2026-03-14T10:00:00.000Z");
check("no openedAt in ctx -> no clamp applied",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2020-01-01 00:00:00")
  ], base).assignTimeUtcIso,
  "2020-01-01T00:00:00.000Z");
check("born-in-queue fallback still equals opened_at",
  extractTimelines([], { ...base, openedAtUtcRaw: "2026-03-13 08:00:00" }).assignTimeUtcIso,
  "2026-03-13T08:00:00.000Z");
check("ackn eligibility unaffected by clamp (pre-birth assignment still counts)",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-03-11 10:00:00"),
      ev("assigned_to", "", "Fred Luddy", "2026-03-12 09:00:00")
    ], { ...base, openedAtUtcRaw: "2026-03-13 08:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-03-13T08:00:00.000Z", "2026-03-12T09:00:00.000Z"]);

console.log("== same-epoch queue entry + member assignment => assignTime == acknTime ==");
check("assigned_to listed before same-epoch group entry still acks (equal times)",
  (() => {
    const t = extractTimelines([
      ev("assigned_to", "", "Fred Luddy", "2026-08-23 06:06:43"),
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:06:43")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:06:35" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso, t.assignTimeUtcIso === t.acknTimeUtcIso];
  })(),
  ["2026-08-23T06:06:43.000Z", "2026-08-23T06:06:43.000Z", true]);
check("group entry listed before same-epoch assigned_to also acks (equal times)",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:06:43"),
      ev("assigned_to", "", "Fred Luddy", "2026-08-23 06:06:43")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:06:35" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso, t.assignTimeUtcIso === t.acknTimeUtcIso];
  })(),
  ["2026-08-23T06:06:43.000Z", "2026-08-23T06:06:43.000Z", true]);

console.log("== classic regressions ==");
check("prequeue ackn ignored",
  extractTimelines([
    ev("assigned_to", "", "Fred Luddy", "2026-08-23 06:06:40"),
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:06:43")
  ], { ...base, openedAtUtcRaw: "2026-08-23 06:06:35" }).acknTimeUtcIso,
  null);
check("group re-entry takes latest entry",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:06:50"),
    ev("assignment_group", "QA Queue Alpha", "Other Queue", "2026-08-23 06:06:55"),
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:07:03"),
    ev("assigned_to", "", "ITIL User", "2026-08-23 06:07:06")
  ], { ...base, openedAtUtcRaw: "2026-08-23 06:06:45" }).assignTimeUtcIso,
  "2026-08-23T06:07:03.000Z");
check("first On Hold wins, double hold counted",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:08:00"),
      ev("state", "2", "3", "2026-08-23 06:08:10"),
      ev("state", "3", "2", "2026-08-23 06:08:20"),
      ev("state", "2", "3", "2026-08-23 06:08:30"),
      ev("state", "3", "2", "2026-08-23 06:08:40")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:08:00" });
    return [t.suspendTimeUtcIso, t.onHoldCount];
  })(),
  ["2026-08-23T06:08:10.000Z", 2]);
check("hold->resolve gives resumeSource Resolved",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:09:00"),
      ev("state", "2", "3", "2026-08-23 06:09:05"),
      ev("state", "3", "6", "2026-08-23 06:09:10")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:09:00" });
    return [t.resumeTimeUtcIso, t.resumeSource];
  })(),
  ["2026-08-23T06:09:10.000Z", "Resolved"]);
check("latest In Progress wins (not first)",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:10:00"),
      ev("state", "2", "3", "2026-08-23 06:10:05"),
      ev("state", "3", "2", "2026-08-23 06:10:10"),
      ev("state", "2", "3", "2026-08-23 06:10:20"),
      ev("state", "3", "2", "2026-08-23 06:10:25")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:10:00" });
    return [t.suspendTimeUtcIso, t.resumeTimeUtcIso, t.onHoldCount];
  })(),
  ["2026-08-23T06:10:05.000Z", "2026-08-23T06:10:25.000Z", 2]);
check("resume from any state (not only from On Hold)",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:11:00"),
      ev("state", "2", "3", "2026-08-23 06:11:05"),
      ev("state", "3", "6", "2026-08-23 06:11:10"),
      ev("state", "6", "2", "2026-08-23 06:11:15")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:11:00" });
    return [t.resumeTimeUtcIso, t.resumeSource];
  })(),
  ["2026-08-23T06:11:15.000Z", "In Progress"]);
check("suspend only while in queue (hold during OTHER ignored)",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:07:30"),
    ev("assignment_group", "QA Queue Alpha", "Other Queue", "2026-08-23 06:07:32"),
    ev("state", "2", "3", "2026-08-23 06:07:33"),
    ev("state", "3", "2", "2026-08-23 06:07:34"),
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:07:35")
  ], { ...base, openedAtUtcRaw: "2026-08-23 06:07:20" }).suspendTimeUtcIso,
  null);
check("never held -> resume stays null",
  extractTimelines([
    ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:06:20"),
    ev("state", "1", "6", "2026-08-23 06:06:25")
  ], { ...base, openedAtUtcRaw: "2026-08-23 06:06:20" }).resumeTimeUtcIso,
  null);

console.log("== feed display-label state events (real list_history payload) ==");
check("full lifecycle with label values: ackn+hold+resume",
  (() => {
    const t = extractTimelines([
      ev("state", "", "New", "2026-08-23 06:07:38"),
      ev("assigned_to", "", "ITIL User", "2026-08-23 06:07:44"),
      ev("state", "New", "In Progress", "2026-08-23 06:07:44"),
      ev("state", "In Progress", "On Hold", "2026-08-23 06:07:46"),
      ev("state", "On Hold", "In Progress", "2026-08-23 06:07:50"),
      ev("state", "In Progress", "Resolved", "2026-08-23 06:07:53"),
      ev("state", "Resolved", "Closed", "2026-08-23 06:07:55")
    ], { ...base, snapshotGroupName: "QA Queue Alpha", openedAtUtcRaw: "2026-08-23 06:07:38" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso, t.resumeSource];
  })(),
  ["2026-08-23T06:07:38.000Z", "2026-08-23T06:07:44.000Z", "2026-08-23T06:07:46.000Z", "2026-08-23T06:07:53.000Z", "Resolved"]);
check("label hold->resolved fallback still works",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other Queue", "QA Queue Alpha", "2026-08-23 06:09:00"),
      ev("state", "2", "3", "2026-08-23 06:09:05"),
      ev("state", "On Hold", "Resolved", "2026-08-23 06:09:10")
    ], { ...base, openedAtUtcRaw: "2026-08-23 06:09:00" });
    return [t.suspendTimeUtcIso, t.resumeTimeUtcIso, t.resumeSource];
  })(),
  ["2026-08-23T06:09:05.000Z", "2026-08-23T06:09:10.000Z", "Resolved"]);

console.log("== analyzeAll: suspend/resume only for closed/resolved incidents ==");
(() => {
  const stateMap = { 1: "New", 2: "In Progress", 3: "On Hold", 6: "Resolved", 7: "Closed" };
  const auditRows = [
    { field: "assignment_group", oldValue: "Other", newValue: "QA Queue Alpha", at: "2026-08-23 06:01:00" },
    { field: "state", oldValue: "2", newValue: "3", at: "2026-08-23 06:02:00" },
    { field: "state", oldValue: "3", newValue: "2", at: "2026-08-23 06:03:00" },
    { field: "state", oldValue: "2", newValue: "7", at: "2026-08-23 06:04:00" }
  ];
  const queueCtx = {
    membersByQueue: { "qa queue alpha": ["Fred Luddy"] },
    fallbackMembers: [],
    tableName: "incident"
  };
  const makeRec = (sysId, number, state) => ({ sys_id: sysId, number, state, assignment_group: "QA Queue Alpha", opened_at: "2026-08-23 06:00:00" });
  const incidentAudit = { s1: auditRows, s2: auditRows, s3: auditRows };

  const incidentRecs = [
    makeRec("s1", "INC001", "Closed"),
    makeRec("s2", "INC002", "In Progress"),
    makeRec("s3", "INC003", "Resolved")
  ];
  const res1 = analyzeAll(incidentRecs, incidentAudit, stateMap, queueCtx);
  const closed = res1.rows.find(r => r.number === "INC001");
  const open = res1.rows.find(r => r.number === "INC002");
  const resolved = res1.rows.find(r => r.number === "INC003");
  check("closed incident has suspendTime", !!closed.suspendTimeUtcIso, true);
  check("closed incident has resumeTime", !!closed.resumeTimeUtcIso, true);
  check("resolved incident has suspendTime", !!resolved.suspendTimeUtcIso, true);
  check("resolved incident has resumeTime", !!resolved.resumeTimeUtcIso, true);
  check("open incident has no suspendTime", open.suspendTimeUtcIso, "");
  check("open incident has no resumeTime", open.resumeTimeUtcIso, "");

  const problemRecs = [makeRec("s4", "PRB001", "Closed")];
  const res2 = analyzeAll(problemRecs, { s4: auditRows }, stateMap, { ...queueCtx, tableName: "problem" });
  const problem = res2.rows.find(r => r.number === "PRB001");
  check("closed problem has no suspendTime", problem.suspendTimeUtcIso, "");
  check("closed problem has no resumeTime", problem.resumeTimeUtcIso, "");
})();

console.log("== analyzeAll: request_item.number maps to row.requestItem ==");
(() => {
  const stateMap = { 1: "Open", 2: "In progress", 3: "Closed Complete" };
  const queueCtx = { membersByQueue: {}, fallbackMembers: [], tableName: "sc_task" };
  const recs = [
    { sys_id: "t1", number: "SCTASK0001", state: "In progress", opened_at: "2026-08-23 06:00:00",
      "request_item.number": { display_value: "RITM0012345", value: "RITM0012345" } },
    { sys_id: "t2", number: "SCTASK0002", state: "In progress", opened_at: "2026-08-23 06:00:00" }
  ];
  const res = analyzeAll(recs, {}, stateMap, queueCtx);
  const withRitm = res.rows.find(r => r.number === "SCTASK0001");
  const noRitm = res.rows.find(r => r.number === "SCTASK0002");
  check("sc_task maps request_item.number to requestItem", withRitm.requestItem, "RITM0012345");
  check("sc_task with no request_item has empty requestItem", noRitm.requestItem, "");
})();

console.log("== analyzeAll: state resolves to a text label ==");
(() => {
  const problemMap = { "103": "root cause analysis", "157": "Closed" };
  const ctx = { membersByQueue: {}, fallbackMembers: [], tableName: "problem" };
  const recA = { sys_id: "p1", number: "PRB0001", state: { value: "2", display_value: "2" }, problem_state: { value: "103", display_value: "103" }, opened_at: "2026-08-23 06:00:00", assignment_group: "X" };
  const resA = analyzeAll([recA], {}, problemMap, ctx);
  check("problem reads problem_state, not state", resA.rows[0].state, "root cause analysis");
  check("problem stateValue is the problem_state raw code", resA.rows[0].stateValue, "103");

  const incMap = { "7": "Closed" };
  const recB = { sys_id: "i1", number: "INC0001", state: { value: "7", display_value: "Closed" }, opened_at: "2026-08-23 06:00:00", assignment_group: "X" };
  const resB = analyzeAll([recB], {}, incMap, { ...ctx, tableName: "incident" });
  check("existing text display value is untouched", resB.rows[0].state, "Closed");

  const recC = { sys_id: "s1", number: "INC0002", state: "In Progress", opened_at: "2026-08-23 06:00:00", assignment_group: "X" };
  const resC = analyzeAll([recC], {}, {}, { ...ctx, tableName: "incident" });
  check("string state passes through", resC.rows[0].state, "In Progress");
})();

console.log("== extractEventsFromListHistory: problem_state is aliased to state ==");
(() => {
  const payload = {
    entries: [
      {
        document_id: "p1",
        sys_created_on: "2026-08-23 06:02:00",
        entries: { changes: [{ field_name: "problem_state", old_value: "101", new_value: "103" }] }
      }
    ]
  };
  const byTicket = extractEventsFromListHistory(payload);
  const ev = (byTicket.p1 || [])[0];
  check("problem_state change becomes a state event", ev && ev.field, "state");
  check("problem_state new value preserved", ev && ev.newValue, "103");
})();

console.log("== Bug 1: stay-based assign+ack resolution ==");
// S-A: leave→return, no new ack — should recover ack from prior stay
check("S-A: ack from prior stay recovered after re-entry",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:01:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 08:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-09-01T08:01:00.000Z", "2026-09-01T08:05:00.000Z"]);

// S-B: two stays, ack in latest stay — normal case, no change
check("S-B: ack in latest stay uses latest entry as assignTime",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:01:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("assigned_to", "", "ITIL User",                 "2026-09-01 10:05:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 08:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-09-01T10:00:00.000Z", "2026-09-01T10:05:00.000Z"]);

// S-C: three stays, ack only in first
check("S-C: three stays — ack recovered from oldest stay",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 11:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 12:00:00"),
      ev("state", "2", "6",                              "2026-09-01 13:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-09-01T08:00:00.000Z", "2026-09-01T08:05:00.000Z"]);

// S-F: no ack ever — assignTime stays at latest entry
check("S-F: no ack ever — assignTime equals latest queue entry",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-09-01T10:00:00.000Z", null]);

console.log("== Bug 2: suspend ordering — all holds anchored to assignTime ==");
// S-D: held first stay, re-enters, no new hold — suspend from first stay kept (> assignTime)
check("S-D: hold in first stay preserved when assignTime walks back",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("state", "2", "3",                              "2026-09-01 08:30:00"),
      ev("state", "3", "2",                              "2026-09-01 09:00:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:30:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  ["2026-09-01T08:00:00.000Z", "2026-09-01T08:05:00.000Z", "2026-09-01T08:30:00.000Z", "2026-09-01T09:00:00.000Z"]);

// S-E: held both stays, ack only in first — first hold > assignTime wins, resume from last hold
check("S-E: held both stays — suspend from first, resume from last hold",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("state", "2", "3",                              "2026-09-01 08:30:00"),
      ev("state", "3", "2",                              "2026-09-01 09:00:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:30:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "3",                              "2026-09-01 10:30:00"),
      ev("state", "3", "2",                              "2026-09-01 11:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:30:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  ["2026-09-01T08:00:00.000Z", "2026-09-01T08:30:00.000Z", "2026-09-01T11:30:00.000Z"]);

// S-E2: no hold in stay1, hold in stay2, ack in stay1 — hold from stay2 picked up
check("S-E2: hold only in later stay, ack in first stay — hold picked up",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("assigned_to", "", "Fred Luddy",               "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:30:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "3",                              "2026-09-01 10:30:00"),
      ev("state", "3", "2",                              "2026-09-01 11:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:30:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  ["2026-09-01T08:00:00.000Z", "2026-09-01T10:30:00.000Z", "2026-09-01T11:30:00.000Z"]);

// S-G: hold before assignTime (no ack, latest entry becomes assignTime) — dropped
check("S-G: hold before assignTime is dropped",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("state", "2", "3",                              "2026-09-01 08:01:00"),
      ev("state", "3", "2",                              "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  ["2026-09-01T10:00:00.000Z", null, null]);

// Bug 2b: original order bug — hold during first stay, re-enters with no ack → assignTime=latest, hold dropped
check("Bug 2b: stale suspend from prior stay dropped when assignTime resets to latest entry",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("state", "2", "3",                              "2026-09-01 08:01:00"),
      ev("state", "3", "2",                              "2026-09-01 08:05:00"),
      ev("assignment_group", "QA Queue Alpha", "SIAM",   "2026-09-01 09:00:00"),
      ev("assignment_group", "SIAM", "QA Queue Alpha",   "2026-09-01 10:00:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.assignTimeUtcIso, t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  ["2026-09-01T10:00:00.000Z", null, null]);

console.log("== Task 4: enforceOrderingContract guard ==");
// Backdated suspend <= assign — guard must null it out
check("enforceOrderingContract: suspend <= assignTime is nulled",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 10:00:00"),
      ev("state", "2", "3",                              "2026-09-01 09:00:00"),
      ev("state", "3", "2",                              "2026-09-01 09:30:00"),
      ev("state", "2", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.suspendTimeUtcIso, t.resumeTimeUtcIso];
  })(),
  [null, null]);

// Resume <= suspend — guard path: verified via hold that transitions directly to Resolved
// (resumeSource "Resolved" is valid and preserved — guard only fires on truly invalid ordering)
check("enforceOrderingContract: hold->resolved captured as resume source Resolved",
  (() => {
    const t = extractTimelines([
      ev("assignment_group", "Other", "QA Queue Alpha", "2026-09-01 08:00:00"),
      ev("state", "2", "3",                              "2026-09-01 09:00:00"),
      ev("state", "3", "6",                              "2026-09-01 11:00:00")
    ], { ...base, openedAtUtcRaw: "2026-09-01 07:00:00" });
    return [t.suspendTimeUtcIso, t.resumeTimeUtcIso, t.resumeSource];
  })(),
  ["2026-09-01T09:00:00.000Z", "2026-09-01T11:00:00.000Z", "Resolved"]);

console.log("== Option B: measure against ANY of our configured queues ==");
// Our queues = QA Queue Alpha + INFORM; members = Fred Luddy, ITIL User.
const multi = {
  stateMap: base.stateMap,
  queueNames: ["QA Queue Alpha", "INFORM"],
  memberNames: base.memberNames
};
const mrun = (rows, snap, openedAt) => extractTimelines(rows, {
  ...multi, queueName: snap, snapshotGroupName: snap, openedAtUtcRaw: openedAt
});

check("S1 multi-queue, acked in earlier of our queues (assign goes back)",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "QA Queue Alpha", "2026-01-01 09:00:00"),
      ev("assigned_to", "", "Fred Luddy", "2026-01-01 09:05:00"),
      ev("assignment_group", "QA Queue Alpha", "ETL", "2026-01-01 10:00:00"),
      ev("assignment_group", "ETL", "QA Queue Alpha", "2026-01-01 11:00:00"),
      ev("assigned_to", "", "ITIL User", "2026-01-01 11:20:00"),
      ev("assignment_group", "QA Queue Alpha", "INFORM", "2026-01-01 15:00:00")
    ], "INFORM", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T11:00:00.000Z", "2026-01-01T11:20:00.000Z"]);

check("S2 acked in the latest of our queues",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "QA Queue Alpha", "2026-01-01 09:00:00"),
      ev("assignment_group", "QA Queue Alpha", "INFORM", "2026-01-01 12:00:00"),
      ev("assigned_to", "", "Fred Luddy", "2026-01-01 12:30:00")
    ], "INFORM", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T12:00:00.000Z", "2026-01-01T12:30:00.000Z"]);

check("S3 acked-stay wins over a later un-acked our-queue stay",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "QA Queue Alpha", "2026-01-01 09:00:00"),
      ev("assigned_to", "", "Fred Luddy", "2026-01-01 09:10:00"),
      ev("assignment_group", "QA Queue Alpha", "INFORM", "2026-01-01 14:00:00")
    ], "INFORM", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T09:00:00.000Z", "2026-01-01T09:10:00.000Z"]);

check("S4 through our queues but never acked -> latest entry, ack null",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "QA Queue Alpha", "2026-01-01 09:00:00"),
      ev("assigned_to", "", "Zoe Nonmember", "2026-01-01 09:10:00"),
      ev("assignment_group", "QA Queue Alpha", "INFORM", "2026-01-01 14:00:00")
    ], "INFORM", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T14:00:00.000Z", null]);

check("S5 ticket never entered any of our queues -> both null",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "ETL", "2026-01-01 09:00:00"),
      ev("assigned_to", "", "Zoe Nonmember", "2026-01-01 09:10:00")
    ], "ETL", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  [null, null]);

check("S6 born in one of our queues, acked",
  (() => {
    const t = mrun([
      ev("assigned_to", "", "Fred Luddy", "2026-01-01 08:30:00")
    ], "QA Queue Alpha", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T08:00:00.000Z", "2026-01-01T08:30:00.000Z"]);

check("S7 ack epoch equals our-queue entry epoch",
  (() => {
    const t = mrun([
      ev("assignment_group", "OTHER", "QA Queue Alpha", "2026-01-01 09:00:00"),
      ev("assigned_to", "", "Fred Luddy", "2026-01-01 09:00:00")
    ], "QA Queue Alpha", "2026-01-01 08:00:00");
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-01-01T09:00:00.000Z", "2026-01-01T09:00:00.000Z"]);

console.log("== Option B: real BA ticket (APPSUP_AIRPORTOPS + APPSUP_INFORM) ==");
check("BA ticket resolves assign+ack from the earlier acked AIRPORTOPS stay",
  (() => {
    const rows = [
      ev("assignment_group", "", "APPSUP_AIRPORTOPS", "2026-08-28 07:20:48"),
      ev("state", "", "New", "2026-08-28 07:20:48"),
      ev("assigned_to", "", "Sethupathi Rammohan", "2026-08-28 09:11:17"),
      ev("state", "New", "In Progress", "2026-08-28 09:11:17"),
      ev("assigned_to", "Sethupathi Rammohan", "", "2026-08-28 13:55:08"),
      ev("assignment_group", "APPSUP_AIRPORTOPS", "APPSUP_ETL", "2026-08-28 13:55:08"),
      ev("state", "In Progress", "Open", "2026-08-28 13:55:08"),
      ev("assigned_to", "", "Jeevabharathi Srinivaasan", "2026-08-28 14:04:09"),
      ev("state", "Open", "In Progress", "2026-08-28 14:04:09"),
      ev("assigned_to", "Jeevabharathi Srinivaasan", "", "2026-08-28 16:05:35"),
      ev("assignment_group", "APPSUP_ETL", "APPSUP_AIRPORTOPS", "2026-08-28 16:05:35"),
      ev("state", "In Progress", "Open", "2026-08-28 16:05:35"),
      ev("assigned_to", "", "Sethupathi Rammohan", "2026-08-28 16:26:43"),
      ev("state", "Open", "In Progress", "2026-08-28 16:26:43"),
      ev("assignment_group", "APPSUP_AIRPORTOPS", "APPSUP_INFORM", "2026-08-31 23:07:05"),
      ev("state", "In Progress", "Resolved", "2026-08-31 23:07:05"),
      ev("state", "Resolved", "Closed", "2026-09-03 23:44:10")
    ];
    const t = extractTimelines(rows, {
      stateMap: {},
      queueName: "appsup_inform",
      queueNames: ["APPSUP_AIRPORTOPS", "APPSUP_INFORM"],
      memberNames: ["Sethupathi Rammohan"],
      snapshotGroupName: "APPSUP_INFORM",
      openedAtUtcRaw: "2026-08-28 07:20:48"
    });
    return [t.assignTimeUtcIso, t.acknTimeUtcIso];
  })(),
  ["2026-08-28T16:05:35.000Z", "2026-08-28T16:26:43.000Z"]);

console.log(`\nphase2: ${failed ? failed + " FAILED" : "all passed"}`);
process.exit(failed ? 1 : 0);
