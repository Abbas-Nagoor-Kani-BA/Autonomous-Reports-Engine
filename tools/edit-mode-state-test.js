import { test } from "node:test";
import assert from "node:assert/strict";
import { getEditMode, setEditMode } from "../surfaces/viewer/edit-mode-state.ts";

test("edit mode defaults off", () => {
  assert.equal(getEditMode(), false);
});

test("edit mode set/get toggles", () => {
  setEditMode(true);
  assert.equal(getEditMode(), true);
  setEditMode(false);
  assert.equal(getEditMode(), false);
});

test("edit mode coerces truthy/falsy to boolean", () => {
  setEditMode(1);
  assert.equal(getEditMode(), true);
  setEditMode(0);
  assert.equal(getEditMode(), false);
});
