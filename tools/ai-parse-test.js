#!/usr/bin/env node
import { extractHeuristic, findLabeledValue } from "../core/aiextract.ts";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok " : "FAIL"} ${name}${ok ? "" : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

// extractHeuristic now only produces solutionType; rootCause is always "" (the
// root-cause CATEGORY is derived by categorizeField/classifyMsr, not here).
const NONE = { solutionType: "", rootCause: "", confidence: { solutionType: "", rootCause: "" } };
const sol = (v, conf) => ({ solutionType: v, rootCause: "", confidence: { solutionType: conf, rootCause: "" } });

console.log("== extractHeuristic: solution type only ==");
check("labeled Resolution Type: Permanent -> high",
  extractHeuristic(`Issue: Users could not log in.\nResolution Type: Permanent`),
  sol("Permanent solution", "high"));

check("labeled 'is it permanent: No' -> workaround (medium)",
  extractHeuristic(`Report page timed out.\nis it permanent solution: No - monitoring for now`),
  sol("Workaround solution", "medium"));

check("prose permanent fix -> permanent (medium)",
  extractHeuristic("Rebuilt the index and verified. This is a permanent fix."),
  sol("Permanent solution", "medium"));

check("temporary keyword -> workaround (medium)",
  extractHeuristic("Cleared paper jam and reinstalled driver as temporary measure."),
  sol("Workaround solution", "medium"));

check("vendor deferral wording -> workaround (medium)",
  extractHeuristic("Disabled the failing integration until vendor provides a patch."),
  sol("Workaround solution", "medium"));

check("typo'd label 'Resoultion Type' still matched -> high",
  extractHeuristic(`Resoultion Type: Permanent Fix`),
  sol("Permanent solution", "high"));

check("unknown resolution type 'education' -> workaround bucket",
  extractHeuristic(`Resolution Type: User education provided`),
  sol("Workaround solution", "high"));

check("genuinely unknown resolution type passed through verbatim",
  extractHeuristic(`Resolution Type: Vendor hotfix applied`),
  sol("Vendor hotfix applied", "high"));

check("root-cause narrative is NOT extracted anymore",
  extractHeuristic(`Analysis (Root Cause): Cache was stale on the replica nodes.`),
  NONE);

check("empty notes", extractHeuristic(""), NONE);

console.log("\n== findLabeledValue (label-directed capture) ==");
check("captures Root Cause Category value (fuzzy 'Rootcause category')",
  findLabeledValue(`Issue: job died.\n\nRootcause category:\n   job/schedule failuer\n\nSteps Taken: rerun`, ["rootCauseCategory"]),
  "job/schedule failuer");

check("captures Resolution Type value",
  findLabeledValue(`Resolution Type:\n Permanent\n\nPreventive Actions: none`, ["resolutionType"]),
  "Permanent");

check("does NOT treat 'Analysis (Root Cause)' as the category label",
  findLabeledValue(`Analysis (Root Cause): disk filled up`, ["rootCauseCategory"]),
  "");

check("returns empty when the label is absent",
  findLabeledValue(`Just some free prose with no headers.`, ["rootCauseCategory"]),
  "");

console.log(`\nai-extract: ${failed ? failed + " FAILED" : "all passed"}`);
process.exit(failed ? 1 : 0);
