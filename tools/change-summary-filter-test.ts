import { test } from "node:test";
import assert from "node:assert/strict";

import { weekRanges } from "../core/summary/summarydetails.ts";
import {
  defaultChangeSummaryWindows,
  resolveChangeSummaryWindows,
  encodeChangeSummaryWindow
} from "../core/summary/change-summary-filter.ts";

const FIXED = new Date("2026-01-15T12:00:00Z");

// Reproduce the legacy #pullChangeSummary encoding independently.
function legacyScope(groupNames) {
  return groupNames.length
    ? `assignment_group.nameIN${groupNames.map((g) => String(g).replace(/['\\]/g, "")).join(",")}^`
    : "";
}
function legacyLastWeek(from, to, groupNames) {
  return `${legacyScope(groupNames)}end_dateBETWEENjavascript:gs.dateGenerate('${from}','00:00:00')@javascript:gs.dateGenerate('${to}','23:59:59')`;
}
function legacyNextWeek(from, to, groupNames) {
  return `${legacyScope(groupNames)}start_dateBETWEENjavascript:gs.dateGenerate('${from}','00:00:00')@javascript:gs.dateGenerate('${to}','23:59:59')`;
}

test("defaults produce end_date/start_date windows with dates from weekRanges", () => {
  const weeks = weekRanges(FIXED);
  const w = defaultChangeSummaryWindows(FIXED);

  assert.equal(w.overridden, false);

  assert.equal(w.lastWeek.dateField, "end_date");
  assert.equal(w.lastWeek.from, weeks.last.from);
  assert.equal(w.lastWeek.to, weeks.last.to);
  assert.deepEqual(w.lastWeek.conditions, []);

  assert.equal(w.nextWeek.dateField, "start_date");
  assert.equal(w.nextWeek.from, weeks.current.from);
  assert.equal(w.nextWeek.to, weeks.current.to);
  assert.deepEqual(w.nextWeek.conditions, []);
});

test("resolveChangeSummaryWindows recomputes for null/undefined/non-overridden", () => {
  const expected = defaultChangeSummaryWindows(FIXED);

  assert.deepEqual(resolveChangeSummaryWindows(null, FIXED), expected);
  assert.deepEqual(resolveChangeSummaryWindows(undefined, FIXED), expected);

  const notOverridden = defaultChangeSummaryWindows(new Date("2020-01-01T00:00:00Z"));
  notOverridden.overridden = false;
  assert.deepEqual(resolveChangeSummaryWindows(notOverridden, FIXED), expected);
});

test("overridden without datesCustom keeps conditions but auto-advances dates to current week", () => {
  const stored = defaultChangeSummaryWindows(new Date("2020-01-01T00:00:00Z"));
  stored.overridden = true;
  stored.lastWeek.conditions = [
    { join: "AND", field: "state", oper: "eq", value: "3", value2: "" }
  ];
  const weeks = weekRanges(FIXED);
  const resolved = resolveChangeSummaryWindows(stored, FIXED);

  assert.equal(resolved.overridden, true);
  // conditions stay sticky
  assert.deepEqual(resolved.lastWeek.conditions, stored.lastWeek.conditions);
  // dates recompute to the FIXED-week defaults, not the stored 2020 dates
  assert.equal(resolved.lastWeek.from, weeks.last.from);
  assert.equal(resolved.lastWeek.to, weeks.last.to);
  assert.equal(resolved.nextWeek.from, weeks.current.from);
  assert.equal(resolved.nextWeek.to, weeks.current.to);
});

test("overridden with datesCustom keeps the user-edited dates", () => {
  const stored = defaultChangeSummaryWindows(new Date("2020-01-01T00:00:00Z"));
  stored.overridden = true;
  stored.nextWeek.datesCustom = true;
  stored.nextWeek.from = "2030-06-10";
  stored.nextWeek.to = "2030-06-16";
  const weeks = weekRanges(FIXED);
  const resolved = resolveChangeSummaryWindows(stored, FIXED);

  // custom next-week dates are preserved
  assert.equal(resolved.nextWeek.from, "2030-06-10");
  assert.equal(resolved.nextWeek.to, "2030-06-16");
  // last week had no custom flag, so it auto-advances
  assert.equal(resolved.lastWeek.from, weeks.last.from);
  assert.equal(resolved.lastWeek.to, weeks.last.to);
});

test("encode is byte-identical to legacy for empty conditions (no groupNames)", () => {
  const w = defaultChangeSummaryWindows(FIXED);
  const weeks = weekRanges(FIXED);

  assert.equal(
    encodeChangeSummaryWindow(w.lastWeek, []),
    legacyLastWeek(weeks.last.from, weeks.last.to, [])
  );
  assert.equal(
    encodeChangeSummaryWindow(w.nextWeek, []),
    legacyNextWeek(weeks.current.from, weeks.current.to, [])
  );
});

test("encode is byte-identical to legacy for empty conditions (with groupNames)", () => {
  const w = defaultChangeSummaryWindows(FIXED);
  const weeks = weekRanges(FIXED);
  const groups = ["Network Ops", "O'Brien's Team", "Back\\slash"];

  assert.equal(
    encodeChangeSummaryWindow(w.lastWeek, groups),
    legacyLastWeek(weeks.last.from, weeks.last.to, groups)
  );
  assert.equal(
    encodeChangeSummaryWindow(w.nextWeek, groups),
    legacyNextWeek(weeks.current.from, weeks.current.to, groups)
  );
});

test("encode appends an extra condition after the date anchor", () => {
  const w = defaultChangeSummaryWindows(FIXED);
  const weeks = weekRanges(FIXED);
  w.lastWeek.conditions = [{ join: "AND", field: "state", oper: "eq", value: "3", value2: "" }];

  const expected = legacyLastWeek(weeks.last.from, weeks.last.to, []) + "^state=3";
  assert.equal(encodeChangeSummaryWindow(w.lastWeek, []), expected);
});

test("encode joins a second extra condition with ^OR when join is OR", () => {
  const w = defaultChangeSummaryWindows(FIXED);
  const weeks = weekRanges(FIXED);
  w.nextWeek.conditions = [
    { join: "AND", field: "state", oper: "eq", value: "2", value2: "" },
    { join: "OR", field: "priority", oper: "eq", value: "1", value2: "" }
  ];

  const expected =
    legacyNextWeek(weeks.current.from, weeks.current.to, ["Grp"]) + "^state=2^ORpriority=1";
  assert.equal(encodeChangeSummaryWindow(w.nextWeek, ["Grp"]), expected);
});
