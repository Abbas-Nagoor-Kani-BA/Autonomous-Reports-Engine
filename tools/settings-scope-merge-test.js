import test from "node:test";
import assert from "node:assert/strict";

import { mergeSortedNames, sortNames, subtractNames } from "../core/scope/resolve-scope.ts";

/*
 * The Settings "Resolve members & queues" button merges the resolved names into
 * the existing chip lists with `mergeSortedNames` — de-duped case-insensitively
 * (the chip list's `normalizeNames` rule) and sorted A–Z. This asserts the exact
 * merge the click handler performs for both lists without a DOM.
 */

test("resolving into empty lists fills them sorted A–Z", () => {
  assert.deepEqual(mergeSortedNames([], ["Service Desk", "Network Ops"]), ["Network Ops", "Service Desk"]);
  assert.deepEqual(mergeSortedNames([], ["Bob Brown", "Alice Adams"]), ["Alice Adams", "Bob Brown"]);
});

test("resolving keeps manually typed values and sorts the whole list", () => {
  const queues = mergeSortedNames(["My Custom Queue"], ["Network Ops", "My Custom Queue"]);
  assert.deepEqual(queues, ["My Custom Queue", "Network Ops"]);
  const members = mergeSortedNames(["Zoe Zhang"], ["Alice Adams", "Mike Miller"]);
  assert.deepEqual(members, ["Alice Adams", "Mike Miller", "Zoe Zhang"]);
});

test("resolving is case-insensitive against existing values (no duplicate casing)", () => {
  const members = mergeSortedNames(["alice adams"], ["Alice Adams", "Bob Brown"]);
  assert.deepEqual(members, ["alice adams", "Bob Brown"]);
});

test("resolving twice does not grow the list (idempotent) and stays sorted", () => {
  const once = mergeSortedNames(["Network Ops"], ["Service Desk"]);
  const twice = mergeSortedNames(once, ["Service Desk", "Network Ops"]);
  assert.deepEqual(twice, ["Network Ops", "Service Desk"]);
});

test("empty resolved result leaves the existing values but sorts them", () => {
  assert.deepEqual(mergeSortedNames(["Service Desk", "Network Ops"], []), ["Network Ops", "Service Desk"]);
});

test("sortNames sorts case-insensitively and locale-aware without deduping", () => {
  assert.deepEqual(sortNames(["banana", "Apple", "cherry"]), ["Apple", "banana", "cherry"]);
  assert.deepEqual(sortNames([]), []);
  assert.deepEqual(sortNames(null), []);
});

test("subtractNames keeps only members not already present (case-insensitive)", () => {
  // The picker only offers names the Team members list does not already have.
  assert.deepEqual(subtractNames(["Alice Adams", "Bob Brown", "Carol Clark"], ["alice adams", "carol clark"]), ["Bob Brown"]);
});

test("subtractNames returns empty when every candidate is already present", () => {
  assert.deepEqual(subtractNames(["Alice", "Bob"], ["bob", "alice"]), []);
});

test("subtractNames returns all candidates when existing is empty, deduped", () => {
  assert.deepEqual(subtractNames(["Alice", "alice", "Bob"], []), ["Alice", "Bob"]);
  assert.deepEqual(subtractNames(["Alice"], null), ["Alice"]);
});
