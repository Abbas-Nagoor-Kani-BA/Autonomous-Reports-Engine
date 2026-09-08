#!/usr/bin/env node
import { ExtractService } from "../services/extract-service.ts";
import { extractHeuristic } from "../core/aiextract.ts";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok " : "FAIL"} ${name}${ok ? "" : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const svc = new ExtractService();

console.log("== ExtractService.applyExtraction (per-row apply loop) ==");

check("stats over 3 rows: only solutionType fills (rootCause is the classifier's job)",
  svc.applyExtraction([
    { closeNotes: "root cause: Expired SAML certificate" },
    { closeNotes: "Replaced cert. permanent solution applied." },
    { closeNotes: "" }
  ]),
  { total: 3, withNotes: 2, filled: 1 });

check("rows already resolved are skipped",
  svc.applyExtraction([
    { closeNotes: "root cause: bad cert", solutionType: "Permanent solution", rootCause: "bad cert" }
  ]),
  { total: 1, withNotes: 1, filled: 0 });

check("fills only solutionType, never touches rootCause",
  (() => {
    const row = { closeNotes: "resolution type: Workaround", rootCause: "full disk" };
    const out = svc.applyExtraction([row]);
    return String(row.solutionType) === "Workaround solution" && String(row.rootCause) === "full disk" && out.filled === 1 && row.parseReview === undefined;
  })(),
  true);

check("RCA analysis narrative is NOT written into rootCause (left for the classifier)",
  (() => {
    const row = { closeNotes: "Analysis (Root Cause): the cache directory filled up completely and corrupted the files" };
    const out = svc.applyExtraction([row]);
    // No resolution keyword -> nothing filled; rootCause must stay empty, never the prose.
    return !row.rootCause && out.filled === 0;
  })(),
  true);

check("solutionType still flags parseReview on medium confidence",
  (() => {
    const row = { closeNotes: "We applied a temporary fix until the vendor patch is released." };
    svc.applyExtraction([row]);
    return String(row.solutionType) === "Workaround solution" && !row.rootCause && row.parseReview === true;
  })(),
  true);

check("smoke: sane default when no notes exist",
  svc.applyExtraction([
    {},
    { closeNotes: null },
    { closeNotes: "   " }
  ]),
  { total: 3, withNotes: 0, filled: 0 });

check("numeric closeNotes never crash (hardened)", (() => {
  let out = null;
  try {
    out = svc.applyExtraction([{ closeNotes: 12345 }]);
  } catch {
    return null;
  }
  return JSON.stringify(out) === JSON.stringify({ total: 1, withNotes: 1, filled: 0 });
})(), true);

console.log("== heuristic pure (solution type only; no rootCause narrative) ==");
check("extractHeuristic direct call",
  extractHeuristic("Resolution Type: Permanent\nAnalysis (Root Cause): Expired SAML certificate"),
  { solutionType: "Permanent solution", rootCause: "", confidence: { solutionType: "high", rootCause: "" } });

process.exit(failed ? 1 : 0);