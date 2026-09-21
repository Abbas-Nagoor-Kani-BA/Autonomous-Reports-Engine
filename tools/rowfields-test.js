import { test } from "node:test";
import assert from "node:assert/strict";

import { isScTask, isRfs, displayNumber, priorityCell } from "../core/export/rowfields.ts";

test("isScTask detects SCTASK numbers only", () => {
  assert.equal(isScTask({ number: "SCTASK0012345" }), true);
  assert.equal(isScTask({ number: "sctask0012345" }), true);
  assert.equal(isScTask({ number: "INC0012345" }), false);
  assert.equal(isScTask({ number: "REQ0012345" }), false);
  assert.equal(isScTask({ number: "PRB0012345" }), false);
  assert.equal(isScTask({}), false);
});

test("isRfs detects SCTASK, REQ and RITM numbers", () => {
  assert.equal(isRfs({ number: "SCTASK0012345" }), true);
  assert.equal(isRfs({ number: "REQ0012345" }), true);
  assert.equal(isRfs({ number: "RITM0012345" }), true);
  assert.equal(isRfs({ number: "req0012345" }), true);
  assert.equal(isRfs({ number: "INC0012345" }), false);
  assert.equal(isRfs({ number: "PRB0012345" }), false);
  assert.equal(isRfs({}), false);
});

test("displayNumber returns the REQ number for sc_task", () => {
  assert.equal(
    displayNumber({ number: "SCTASK0001", request: "REQ0012345", requestItem: "RITM0012345" }),
    "REQ0012345"
  );
});

test("displayNumber falls back to RITM number when no request", () => {
  assert.equal(
    displayNumber({ number: "SCTASK0001", request: "", requestItem: "RITM0012345" }),
    "RITM0012345"
  );
});

test("displayNumber falls back to SCTASK number when no request or request item", () => {
  assert.equal(displayNumber({ number: "SCTASK0001", request: "", requestItem: "" }), "SCTASK0001");
  assert.equal(displayNumber({ number: "SCTASK0001" }), "SCTASK0001");
});

test("displayNumber leaves other ticket types unchanged", () => {
  assert.equal(
    displayNumber({ number: "INC0001", request: "REQ0009", requestItem: "RITM0009" }),
    "INC0001"
  );
  assert.equal(displayNumber({ number: "PRB0001" }), "PRB0001");
});

test("priorityCell is RFS for all RFS work, passthrough otherwise", () => {
  assert.equal(priorityCell({ number: "SCTASK0001", priority: "3 - Moderate" }), "RFS");
  // Regression: REQ / RITM rows are RFS too — their priority cell must not be
  // blank when the source priority is empty.
  assert.equal(priorityCell({ number: "REQ0001", priority: "" }), "RFS");
  assert.equal(priorityCell({ number: "RITM0001" }), "RFS");
  assert.equal(priorityCell({ number: "INC0001", priority: "2 - High" }), "2 - High");
  assert.equal(priorityCell({ number: "PRB0001", priority: 1 }), "1");
  assert.equal(priorityCell({ number: "INC0001" }), "");
});
