import { test } from "node:test";
import assert from "node:assert/strict";

import { orderColumns, orderKeysOf, reorderKeys } from "../viewer/col-order.ts";
import type { ViewerCol } from "../viewer/core.ts";

const COLS: ViewerCol[] = [
  ["a", "A", "", 100],
  ["b", "B", "", 100],
  ["c", "C", "", 100],
  ["d", "D", "", 100]
];

const keys = (cols: ViewerCol[]) => cols.map((c) => c[0]);

test("orderColumns with empty/invalid order is identity", () => {
  assert.deepEqual(keys(orderColumns(COLS, [])), ["a", "b", "c", "d"]);
  assert.deepEqual(keys(orderColumns(COLS, null)), ["a", "b", "c", "d"]);
  assert.deepEqual(keys(orderColumns(COLS, undefined)), ["a", "b", "c", "d"]);
});

test("orderColumns reorders by the given key order", () => {
  assert.deepEqual(keys(orderColumns(COLS, ["c", "a", "d", "b"])), ["c", "a", "d", "b"]);
});

test("orderColumns appends columns missing from the order in original position", () => {
  // Only c and a are ordered; b and d keep their original relative order, appended.
  assert.deepEqual(keys(orderColumns(COLS, ["c", "a"])), ["c", "a", "b", "d"]);
});

test("orderColumns ignores unknown keys in the order", () => {
  assert.deepEqual(keys(orderColumns(COLS, ["zzz", "b", "nope", "a"])), ["b", "a", "c", "d"]);
});

test("orderColumns honors a duplicate key only once", () => {
  assert.deepEqual(keys(orderColumns(COLS, ["b", "b", "a"])), ["b", "a", "c", "d"]);
});

test("orderColumns never mutates its input", () => {
  const copy = COLS.slice();
  orderColumns(COLS, ["d", "c", "b", "a"]);
  assert.deepEqual(COLS, copy);
});

test("orderKeysOf returns the key sequence", () => {
  assert.deepEqual(orderKeysOf(COLS), ["a", "b", "c", "d"]);
});

test("reorderKeys moves a column before a target", () => {
  // Move d before b: a, d, b, c
  assert.deepEqual(reorderKeys(COLS, "d", "b", true), ["a", "d", "b", "c"]);
});

test("reorderKeys moves a column after a target", () => {
  // Move a after c: b, c, a, d
  assert.deepEqual(reorderKeys(COLS, "a", "c", false), ["b", "c", "a", "d"]);
});

test("reorderKeys moving before the first column", () => {
  assert.deepEqual(reorderKeys(COLS, "c", "a", true), ["c", "a", "b", "d"]);
});

test("reorderKeys moving after the last column", () => {
  assert.deepEqual(reorderKeys(COLS, "a", "d", false), ["b", "c", "d", "a"]);
});

test("reorderKeys is a no-op for identical or missing keys", () => {
  assert.deepEqual(reorderKeys(COLS, "a", "a", true), ["a", "b", "c", "d"]);
  assert.deepEqual(reorderKeys(COLS, "x", "a", true), ["a", "b", "c", "d"]);
  assert.deepEqual(reorderKeys(COLS, "a", "x", true), ["a", "b", "c", "d"]);
});

test("reorderKeys adjacent swap (move b after c)", () => {
  assert.deepEqual(reorderKeys(COLS, "b", "c", false), ["a", "c", "b", "d"]);
});

test("order + hidden compose the way visibleCols() does", () => {
  // Mirrors core.ts visibleCols(): orderColumns(COLUMNS, order) then filter hidden.
  const order = ["d", "c", "b", "a"];
  const hidden = new Set(["c"]);
  const visible = orderColumns(COLS, order).filter(([k]) => !hidden.has(k));
  assert.deepEqual(keys(visible), ["d", "b", "a"], "ordered then hidden-filtered");
});
