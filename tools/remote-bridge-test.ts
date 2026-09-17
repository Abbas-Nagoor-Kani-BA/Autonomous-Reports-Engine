import { test } from "node:test";
import assert from "node:assert/strict";

import { RemoteBridge } from "../common/services/remote-bridge.ts";
import { MSG } from "../lib/keys.ts";

const listeners = new Set<(msg: unknown) => void>();
const sent: Record<string, unknown>[] = [];

const fakeChrome = {
  runtime: {
    lastError: null as Error | null,
    onMessage: {
      addListener: (fn: (msg: unknown) => void) => listeners.add(fn),
      removeListener: (fn: (msg: unknown) => void) => listeners.delete(fn)
    },
    sendMessage: (msg: Record<string, unknown>, cb?: (res: unknown) => void) => {
      sent.push(msg);
      if (fakeChrome.runtime.lastError) {
        cb?.(undefined);
      } else {
        cb?.({ ok: true, echoed: msg } as unknown);
      }
      return Promise.resolve();
    }
  }
};

Object.defineProperty(globalThis, "chrome", {
  value: fakeChrome,
  configurable: true,
  writable: true
});

function deliver(msg: Record<string, unknown>): void {
  for (const fn of listeners) fn(msg);
}

test("preview sends COUNT and resolves with the reply", async () => {
  const bridge = new RemoteBridge();
  const res = await bridge.preview({
    instanceUrl: "https://x.service-now.com",
    groups: ["APPSUP_TEST"],
    filters: { table: "incident" }
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.count,
    instanceUrl: "https://x.service-now.com",
    groups: ["APPSUP_TEST"],
    filters: { table: "incident" }
  });
});

test("run sends RUN with filterSets and resolves", async () => {
  const bridge = new RemoteBridge();
  const sets = [{ table: "incident", conditions: [] }];
  const res = await bridge.run({
    instanceUrl: "https://x.service-now.com",
    groups: ["A"],
    filters: sets[0],
    filterSets: sets
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.run,
    instanceUrl: "https://x.service-now.com",
    groups: ["A"],
    filters: sets[0],
    filterSets: sets
  });
});

test("run forwards changeSummaryWindows in the RUN message when provided", async () => {
  const bridge = new RemoteBridge();
  const sets = [{ table: "change_request", conditions: [] }];
  const windows = {
    overridden: true,
    lastWeek: { dateField: "end_date", from: "2030-06-03", to: "2030-06-09", conditions: [] },
    nextWeek: { dateField: "start_date", from: "2030-06-10", to: "2030-06-16", conditions: [] }
  };
  const res = await bridge.run({
    instanceUrl: "https://x.service-now.com",
    groups: ["A"],
    filters: sets[0],
    filterSets: sets,
    includeChangeSummary: true,
    changeSummaryWindows: windows
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.run,
    instanceUrl: "https://x.service-now.com",
    groups: ["A"],
    filters: sets[0],
    filterSets: sets,
    includeChangeSummary: true,
    changeSummaryWindows: windows
  });
});

test("resolveScope sends RESOLVE_SCOPE and resolves with the reply", async () => {
  const bridge = new RemoteBridge();
  const res = await bridge.resolveScope({
    instanceUrl: "https://x.service-now.com",
    currentUserId: "u1"
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.resolveScope,
    instanceUrl: "https://x.service-now.com",
    currentUserId: "u1"
  });
});

test("resolveScope rejects when chrome.runtime.lastError is set", async () => {
  const bridge = new RemoteBridge();
  fakeChrome.runtime.lastError = new Error("sendResponseError: channel closed");
  try {
    await bridge.resolveScope({ instanceUrl: "https://x" });
    assert.fail("should have rejected");
  } catch (err) {
    assert.match((err as Error).message, /channel closed/);
  } finally {
    fakeChrome.runtime.lastError = null;
  }
});

test("resolveGroupMembers sends RESOLVE_GROUP_MEMBERS with the group and resolves", async () => {
  const bridge = new RemoteBridge();
  const res = await bridge.resolveGroupMembers({
    instanceUrl: "https://x.service-now.com",
    group: "Network Ops"
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.resolveGroupMembers,
    instanceUrl: "https://x.service-now.com",
    group: "Network Ops"
  });
});

test("resolveGroupCis sends RESOLVE_GROUP_CIS with the group and resolves", async () => {
  const bridge = new RemoteBridge();
  const res = await bridge.resolveGroupCis({
    instanceUrl: "https://x.service-now.com",
    group: "Network Ops"
  });
  assert.equal(res.ok, true);
  assert.deepEqual(sent[sent.length - 1], {
    type: MSG.resolveGroupCis,
    instanceUrl: "https://x.service-now.com",
    group: "Network Ops"
  });
});

test("request rejects when chrome.runtime.lastError is set", async () => {
  const bridge = new RemoteBridge();
  fakeChrome.runtime.lastError = new Error("sendResponseError: channel closed");
  try {
    await bridge.run({ instanceUrl: "https://x", groups: ["A"] });
    assert.fail("should have rejected");
  } catch (err) {
    assert.match((err as Error).message, /channel closed/);
  } finally {
    fakeChrome.runtime.lastError = null;
  }
});

test("onProgress filters non-PROGRESS messages and unsubscribes", () => {
  const bridge = new RemoteBridge();
  const seen: unknown[] = [];
  const off = bridge.onProgress((msg) => seen.push(msg));

  deliver({ type: MSG.dataUpdated });
  deliver({ type: MSG.progress, stage: "phase1", detail: "tick" });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { type: MSG.progress, stage: "phase1", detail: "tick" });

  off();
  deliver({ type: MSG.progress, stage: "done" });
  assert.equal(seen.length, 1);
});

test("notifyDataUpdated broadcasts DATA_UPDATED fire-and-forget", () => {
  const bridge = new RemoteBridge();
  const before = sent.length;
  bridge.notifyDataUpdated();
  assert.deepEqual(sent[sent.length - 1], { type: MSG.dataUpdated });
  assert.equal(sent.length - before, 1);
});
