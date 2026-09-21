import test from "node:test";
import assert from "node:assert/strict";

import { OverrideStore, resolveItems } from "../sctask/overrides.ts";

test("resolveItems uses shared text for tickets with no override", () => {
  const store = new OverrideStore();
  const items = resolveItems(["s1", "s2"], { comments: "shared c", workNotes: "shared w" }, store);
  assert.deepEqual(items, [
    { sysId: "s1", comments: "shared c", workNotes: "shared w" },
    { sysId: "s2", comments: "shared c", workNotes: "shared w" }
  ]);
});

test("override wins per field; the other field falls back to shared", () => {
  const store = new OverrideStore();
  store.set("s2", { workNotes: "custom note" }); // only work notes overridden
  const items = resolveItems(["s1", "s2"], { comments: "shared c", workNotes: "shared w" }, store);
  assert.deepEqual(items, [
    { sysId: "s1", comments: "shared c", workNotes: "shared w" },
    { sysId: "s2", comments: "shared c", workNotes: "custom note" }
  ]);
});

test("a ticket with an override but empty shared still posts its override", () => {
  const store = new OverrideStore();
  store.set("s1", { comments: "only mine" });
  const items = resolveItems(["s1", "s2"], { comments: "", workNotes: "" }, store);
  // s2 has no text at all -> dropped; s1 posts its override comment.
  assert.deepEqual(items, [{ sysId: "s1", comments: "only mine", workNotes: "" }]);
});

test("tickets with no text at all are dropped (not postable)", () => {
  const store = new OverrideStore();
  const items = resolveItems(["s1"], { comments: "   ", workNotes: "" }, store);
  assert.deepEqual(items, []);
});

test("OverrideStore.set with all-blank fields removes the override", () => {
  const store = new OverrideStore();
  store.set("s1", { comments: "x" });
  assert.ok(store.has("s1"));
  store.set("s1", { comments: "  ", workNotes: "" });
  assert.ok(!store.has("s1"));
  assert.deepEqual(store.keys(), []);
});

test("OverrideStore trims and keeps only non-blank fields", () => {
  const store = new OverrideStore();
  store.set("s1", { comments: "  hi  ", workNotes: "   " });
  assert.deepEqual(store.get("s1"), { comments: "hi" });
});
