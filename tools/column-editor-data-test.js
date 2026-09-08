import { test } from "node:test";
import assert from "node:assert/strict";
import { columnEntries, focusedIndexOf } from "../surfaces/viewer/column-editor-data.ts";

const rows = [
  { sysId: "s1", number: "INC0001", assignedTo: "Jane Doe" },
  { sysId: "s2", number: "INC0002", assignedTo: "Bob Roy" },
  { sysId: "s3", number: "INC0003", assignedTo: null },
  { sysId: "s4", number: "INC0004" }
];

test("columnEntries returns aligned number/value entries in order", () => {
  const e = columnEntries(rows, "assignedTo");
  assert.equal(e.length, 4);
  assert.deepEqual(e[0], { sysId: "s1", number: "INC0001", value: "Jane Doe" });
  assert.deepEqual(e[1], { sysId: "s2", number: "INC0002", value: "Bob Roy" });
});

test("columnEntries stringifies null/undefined values to empty string", () => {
  const e = columnEntries(rows, "assignedTo");
  assert.equal(e[2].value, "");
  assert.equal(e[3].value, "");
});

test("columnEntries handles empty/missing input", () => {
  assert.deepEqual(columnEntries([], "assignedTo"), []);
  assert.deepEqual(columnEntries(null, "assignedTo"), []);
});

test("columnEntries stringifies non-string sysId/number", () => {
  const e = columnEntries([{ sysId: 12, number: 34, x: "v" }], "x");
  assert.deepEqual(e[0], { sysId: "12", number: "34", value: "v" });
});

test("focusedIndexOf finds by sysId, -1 when absent", () => {
  const e = columnEntries(rows, "assignedTo");
  assert.equal(focusedIndexOf(e, "s3"), 2);
  assert.equal(focusedIndexOf(e, "nope"), -1);
});
