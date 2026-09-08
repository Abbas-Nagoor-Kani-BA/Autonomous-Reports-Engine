import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyMsr } from "../core/msrcategorize.ts";
import { MSR_DEFAULT_LISTS, rootCauseFor, msrType } from "../core/msrchoices.ts";

const INCIDENT_RC = rootCauseFor(MSR_DEFAULT_LISTS.rootCause, msrType("INC001"));
const RESOLUTION = MSR_DEFAULT_LISTS.resolution;

function assertLabel(text, labels, expected, minConfidence = 0.35) {
  const r = classifyMsr(text, labels, { minConfidence });
  assert.equal(r.label, expected, `expected "${expected}" for: ${text}`);
  assert.ok(r.confidence >= 0, "confidence is a number");
  return r;
}

test("classifyMsr maps a hardware root cause", () => {
  const text = "Root cause was a faulty disk — drive replaced, no other issues.";
  const r = assertLabel(text, INCIDENT_RC, "Hardware");
  assert.ok(r.confidence >= 0.35);
});

test("classifyMsr maps a network issue", () => {
  const text = "Packet loss between router and DC caused persistent connectivity loss.";
  assertLabel(text, INCIDENT_RC, "Network issue");
});

test("classifyMsr maps a certificate expiry", () => {
  const text = "The SSL certificate expired on the load balancer.",
    r = classifyMsr(text, INCIDENT_RC, { minConfidence: 0.3 });
  assert.equal(r.label, "Certificate expiry");
});

test("classifyMsr maps an application bug", () => {
  const text = "Identified a code defect in the module — applied a patch.";
  assertLabel(text, INCIDENT_RC, "Application bug");
});

test("classifyMsr maps user error - procedure", () => {
  const text = "User followed the wrong business process step.";
  assertLabel(text, INCIDENT_RC, "User error - procedure");
});

test("classifyMsr maps environment when infrastructure was the cause", () => {
  const text = "Datacenter cooling failed causing the whole environment to degrade.";
  assertLabel(text, INCIDENT_RC, "Environment");
});

test("classifyMsr returns null with no evidence", () => {
  const r = classifyMsr("appears fine", INCIDENT_RC);
  assert.equal(r.label, null);
  assert.equal(r.confidence, 0);
});

test("classifyMsr returns null on a weak tie", () => {
  const r = classifyMsr("slightly slow", INCIDENT_RC);
  assert.equal(r.label, null);
});

test("classifyMsr detects solution type - workaround", () => {
  assertLabel("Applied a temporary workaround until the vendor ships the patch.", RESOLUTION, "Workaround solution");
});

test("classifyMsr detects solution type - permanent", () => {
  assertLabel("Deployed the permanent code change to production.", RESOLUTION, "Permanent solution");
});

test("classifyMsr detects solution type - verification only", () => {
  assertLabel("Verified in test environment, confirmed working.", RESOLUTION, "Verification only", 0.3);
});

test("classifyMsr maps phrase not just single tokens", () => {
  const r = classifyMsr("user error - procedure", INCIDENT_RC);
  assert.equal(r.label, "User error - procedure");
});

test("classifyMsr respects learned hint overrides", () => {
  const r = classifyMsr("reseeded the DB cache", INCIDENT_RC, {
    hints: { "database performance": ["reseeded"] }
  });
  assert.equal(r.label, "Database performance");
});

test("classifyMsr scores are per-label and deterministic", () => {
  const a = classifyMsr("network latency issue", INCIDENT_RC);
  const b = classifyMsr("network latency issue", INCIDENT_RC);
  assert.deepEqual(a, b);
  assert.ok((a.scores["Network issue"] || 0) > 0);
});

test("classifyMsr works against a P_Ticket root cause list", () => {
  const PTASK_RC = rootCauseFor(MSR_DEFAULT_LISTS.rootCause, msrType("PTASK001"));
  const r = classifyMsr("Incorrect data entered by the user into the file.", PTASK_RC, { minConfidence: 0.3 });
  assert.equal(r.label, "User error - data");
});

test("classifyMsr returns the exact MSR label value", () => {
  assert.equal(classifyMsr("not an issue", INCIDENT_RC).label, "Not an issue");
  assert.equal(classifyMsr("no issue", INCIDENT_RC).label, "Not an issue");
  assert.equal(classifyMsr("network issue", INCIDENT_RC).label, "Network issue");
});

test("cosine similarity boosts confidence on a genuine match", () => {
  const note = "certificate hit its expiry window on the gateway";
  const keywordOnly = classifyMsr(note, INCIDENT_RC, { cosineWeight: 0 });
  const blended = classifyMsr(note, INCIDENT_RC);
  assert.equal(blended.label, "Certificate expiry");
  assert.ok(blended.confidence > keywordOnly.confidence, "blending cosine raises confidence over keyword counting");
});

test("cosine does not over-fire on generic vocabulary", () => {
  assert.equal(classifyMsr("there was an issue", INCIDENT_RC).label, null);
  assert.equal(classifyMsr("appears fine", INCIDENT_RC).label, null);
});

test("blended scorer is deterministic", () => {
  const a = classifyMsr("the interface returned a mapping error", INCIDENT_RC);
  const b = classifyMsr("the interface returned a mapping error", INCIDENT_RC);
  assert.deepEqual(a, b);
});

test("learned hint overrides still feed the cosine vector", () => {
  const r = classifyMsr("reseeded the DB cache", INCIDENT_RC, {
    hints: { "database performance": ["reseeded"] }
  });
  assert.equal(r.label, "Database performance");
});

test("cascade uses the regex stage first (exact phrasing wins)", () => {
  const r = classifyMsr("User error: the operator entered wrong data", INCIDENT_RC, { minConfidence: 0.3 });
  assert.equal(r.label, "User error - procedure", "regex 'user error' wins before keyword/cosine");
  assert.equal(r.level, "regex");
});

test("cascade uses the keyword stage when hint hits clear the bar", () => {
  const r = classifyMsr("reseeded and reindexed the DB cache", INCIDENT_RC, {
    hints: { "database performance": ["reseeded", "reindexed"] },
    useRegex: false,
    minConfidence: 0.3
  });
  assert.equal(r.label, "Database performance");
  assert.equal(r.level, "keyword", "two hint hits using no regex pick the keyword stage");
});

test("cascade falls to cosine for a paraphrase with no exact phrase", () => {
  const r = classifyMsr("interface data mismatch on the payload", INCIDENT_RC, {
    hints: { "interface data error": [] },
    useRegex: false,
    minConfidence: 0.3
  });
  assert.equal(r.label, "Interface data error");
  assert.equal(r.level, "cosine", "no hints -> the cosine stage decides");
});

test("cascade returns null when no stage clears its bar", () => {
  const r = classifyMsr("appears fine", INCIDENT_RC);
  assert.equal(r.label, null);
  assert.equal(r.level, null);
});


import { categorizeField } from "../core/msrcategorize.ts";

const HINTS = MSR_DEFAULT_LISTS.hints;

test("negation: 'no workaround is needed ... permanent code change' -> not Workaround", () => {
  const r = classifyMsr("no workaround is needed, applied a permanent code change", RESOLUTION, { hints: HINTS });
  assert.notEqual(r.label, "Workaround solution");
  assert.equal(r.label, "Permanent solution");
});

test("negation: 'without a workaround' does not score workaround", () => {
  const r = classifyMsr("resolved without a workaround, applied a permanent fix", RESOLUTION, { hints: HINTS });
  assert.notEqual(r.label, "Workaround solution");
});

test("negation: 'not a network issue' does not score Network", () => {
  const r = classifyMsr("this was not a network issue at all", INCIDENT_RC, { hints: HINTS });
  assert.notEqual(r.label, "Network issue");
});

test("negation-aware cosine: 'no database performance issue, it was a firewall block' -> not Database performance", () => {
  const r = classifyMsr("no database performance issue, it was a firewall block on the port", INCIDENT_RC, { hints: HINTS });
  assert.notEqual(r.label, "Database performance");
});

test("multi-match specificity: a multi-word regex outranks a broad single word", () => {
  // "blocked port" (firewall, 2 words) is more specific than "network"/"connectivity".
  const r = classifyMsr("network connectivity issue; a firewall rule blocked the port", INCIDENT_RC, { hints: HINTS });
  assert.ok(r.label === "Firewall" || r.label === "Network issue", `got ${r.label}`);
});

test("categorizeField Case 1: explicit Root Cause Category label wins over the RCA narrative", () => {
  const note = `Issue:
 The job failed during the latest scheduled run.

Impact:
 No business impact was observed.

Analysis (Root Cause):
 Job failure caused by insufficient space on the LAN share.

Rootcause category:
    job/schedule failuer
Steps Taken to Resolve:
 Removed old logs and reran the job successfully.

Resolution Type:
 Permanent

Preventive Actions:
 Monitor disk space.
Problem Ticket Required:
 No
Resolved Supplier:
 N/A`;
  const rc = categorizeField(note, ["rootCauseCategory"], INCIDENT_RC, HINTS);
  assert.equal(rc.label, "Job schedule/scheduler error");
  const sol = categorizeField(note, ["resolutionType"], RESOLUTION, HINTS);
  assert.equal(sol.label, "Permanent solution");
});

test("categorizeField Case 2: no labels -> whole-note fallback", () => {
  const note = "Users could not reach the app; the firewall was blocking port 443 and we opened it. Permanent fix applied.";
  assert.equal(categorizeField(note, ["rootCauseCategory"], INCIDENT_RC, HINTS).label, "Firewall");
  assert.equal(categorizeField(note, ["resolutionType"], RESOLUTION, HINTS).label, "Permanent solution");
});

test("categorizeField Case 5: label value uncategorizable -> whole-note fallback", () => {
  const note = `Root Cause Category: misc other weirdness
The database was slow because queries were unindexed and sql performance degraded.`;
  const rc = categorizeField(note, ["rootCauseCategory"], INCIDENT_RC, HINTS);
  assert.equal(rc.label, "Database performance");
});

test("categorizeField Case 6: nothing resolves -> null", () => {
  const note = "Closed after 3 days in the resolved state.";
  assert.equal(categorizeField(note, ["rootCauseCategory"], INCIDENT_RC, HINTS).label, null);
});
