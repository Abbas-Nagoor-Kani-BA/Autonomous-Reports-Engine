import test from "node:test";
import assert from "node:assert/strict";

import { Container } from "../di/container.ts";
import { registerCoreRepositories } from "../di/register-core.ts";
import { CHANGE_SUMMARY_REPO, KEY_VALUE_STORE } from "../di/tokens.ts";
import { createMemoryKeyValueStore } from "../data/key-value-store.ts";

function testContainer(): Container {
  const c = new Container();
  c.registerValue(KEY_VALUE_STORE, createMemoryKeyValueStore());
  return registerCoreRepositories(c);
}

// Minimal ChangeSummaryWindows-shaped literal, kept inline so this test runs
// standalone without importing the parallel-owned core module.
const sampleWindows = {
  windows: [
    { id: "w1", label: "Last 7 days", days: 7 },
    { id: "w2", label: "Last 30 days", days: 30 }
  ],
  activeId: "w1"
};

test("change summary repository load returns null when unset", async () => {
  const repo = testContainer().resolve(CHANGE_SUMMARY_REPO);
  assert.equal(await repo.load(), null);
});

test("change summary repository round-trips a saved windows object", async () => {
  const repo = testContainer().resolve(CHANGE_SUMMARY_REPO);
  await repo.save(sampleWindows as never);
  assert.deepEqual(await repo.load(), sampleWindows);

  const overridden = { windows: [{ id: "x", label: "Custom", days: 1 }], activeId: "x" };
  await repo.save(overridden as never);
  assert.deepEqual(await repo.load(), overridden);
});

test("change summary repository clear resets to null", async () => {
  const repo = testContainer().resolve(CHANGE_SUMMARY_REPO);
  await repo.save(sampleWindows as never);
  assert.notEqual(await repo.load(), null);
  await repo.clear();
  assert.equal(await repo.load(), null);
});

test("change summary repository yields null for malformed stored values", async () => {
  for (const junk of ["a string", 42, true]) {
    const store = createMemoryKeyValueStore({ changeSummaryFilter: junk });
    const c = new Container();
    c.registerValue(KEY_VALUE_STORE, store);
    const repo = registerCoreRepositories(c).resolve(CHANGE_SUMMARY_REPO);
    assert.equal(await repo.load(), null, `expected null for ${JSON.stringify(junk)}`);
  }
});
