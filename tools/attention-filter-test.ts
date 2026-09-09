import { test } from "node:test";
import assert from "node:assert/strict";

// Back chrome.storage.local with an in-memory store so calclens-highlights
// can call loadHighlightPrefs / saveValue without a real browser environment.
const store: Record<string, unknown> = {};
const fakeChrome = {
  storage: {
    local: {
      get: (keys: string[] | string) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in store) out[k] = store[k];
        return Promise.resolve(out);
      },
      set: (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
        return Promise.resolve();
      },
      remove: (keys: string[] | string) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete store[k];
        return Promise.resolve();
      }
    }
  }
};
Object.defineProperty(globalThis, "chrome", { value: fakeChrome, configurable: true, writable: true });

const { loadHighlightPrefs, setHighlightEnabled, setAll } =
  await import("../surfaces/viewer/calclens-highlights.ts");

const {
  getAttentionFilterActive,
  setAttentionFilterActive,
  applyAttentionFilter
} = await import("../surfaces/viewer/attention-filter.ts");

// ─── helpers ─────────────────────────────────────────────────────────────────

function reset(): void {
  for (const k of Object.keys(store)) delete store[k];
  setAttentionFilterActive(false);
}

/**
 * A row that triggers the "emptyPlan" attention flag (no rootCause, no
 * solutionType). This flag requires no teamMembers / groupScope context.
 */
function emptyPlanRow(id: string): Record<string, unknown> {
  return { sysId: id, number: `INC${id}`, rootCause: "", solutionType: "" };
}

/**
 * A row that triggers the "slowPickup/Never acknowledged" flag: has an
 * assignTimeUtcIso but no acknTimeUtcIso. Requires no teamMembers context.
 */
function neverAcknRow(id: string): Record<string, unknown> {
  return {
    sysId: id,
    number: `INC${id}`,
    assignTimeUtcIso: "2024-01-10T09:00:00.000Z",
    acknTimeUtcIso: "",
    rootCause: "Network issue",
    solutionType: "Permanent solution"
  };
}

/**
 * A row with no attention flags: has a rootCause, solutionType, is acknowledged,
 * and has no problematic history.
 */
function cleanRow(id: string): Record<string, unknown> {
  return {
    sysId: id,
    number: `INC${id}`,
    assignTimeUtcIso: "2024-01-10T09:00:00.000Z",
    acknTimeUtcIso: "2024-01-10T10:00:00.000Z",
    rootCause: "Network issue",
    solutionType: "Permanent solution"
  };
}

const noOpts = { teamMembers: [], groupScope: [] };

// ─── tests ────────────────────────────────────────────────────────────────────

test("getAttentionFilterActive() starts false", async () => {
  reset();
  await loadHighlightPrefs();
  assert.equal(getAttentionFilterActive(), false);
});

test("setAttentionFilterActive(true) makes it true", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  assert.equal(getAttentionFilterActive(), true);
});

test("setAttentionFilterActive(false) makes it false", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  setAttentionFilterActive(false);
  assert.equal(getAttentionFilterActive(), false);
});

test("applyAttentionFilter is identity when filter is inactive", async () => {
  reset();
  await loadHighlightPrefs();
  const rows = [emptyPlanRow("1"), cleanRow("2")];
  const result = applyAttentionFilter(rows, noOpts);
  // Same array reference — not a copy.
  assert.strictEqual(result, rows);
});

test("applyAttentionFilter returns [] when active and no rows have flags", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  const rows = [cleanRow("1"), cleanRow("2"), cleanRow("3")];
  const result = applyAttentionFilter(rows, noOpts);
  assert.equal(result.length, 0);
});

test("applyAttentionFilter keeps only flagged rows when active", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  const flagged1 = emptyPlanRow("10");
  const flagged2 = neverAcknRow("11");
  const clean = cleanRow("12");
  const rows = [flagged1, clean, flagged2];
  const result = applyAttentionFilter(rows, noOpts);
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.sysId === "10"));
  assert.ok(result.some((r) => r.sysId === "11"));
  assert.ok(!result.some((r) => r.sysId === "12"));
});

test("applyAttentionFilter excludes rows flagged only by a disabled rule", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);

  // Disable the emptyPlan rule so emptyPlanRow flags are ignored.
  setHighlightEnabled("emptyPlan", false);

  // emptyPlanRow only fires emptyPlan → should be excluded when that rule is off.
  const onlyEmptyPlan = emptyPlanRow("20");
  // neverAcknRow fires slowPickup (still enabled).
  const alsoSlow = neverAcknRow("21");

  const result = applyAttentionFilter([onlyEmptyPlan, alsoSlow], noOpts);
  assert.equal(result.length, 1);
  assert.equal(result[0].sysId, "21");

  // Re-enable for subsequent tests.
  setHighlightEnabled("emptyPlan", true);
});

test("applyAttentionFilter returns [] for empty input", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  assert.deepEqual(applyAttentionFilter([], noOpts), []);
});

test("applyAttentionFilter does not mutate the input array", async () => {
  reset();
  await loadHighlightPrefs();
  setAttentionFilterActive(true);
  const rows = [emptyPlanRow("30"), cleanRow("31")];
  const original = [...rows];
  applyAttentionFilter(rows, noOpts);
  assert.equal(rows.length, original.length);
  for (let i = 0; i < rows.length; i++) {
    assert.strictEqual(rows[i], original[i]);
  }
});

test("filter with all rules disabled returns [] even for flagged rows", async () => {
  reset();
  await loadHighlightPrefs();
  setAll(false); // disable every rule
  setAttentionFilterActive(true);
  const rows = [emptyPlanRow("40"), neverAcknRow("41")];
  // Even though computeAttention returns flags, none pass isHighlightEnabled.
  const result = applyAttentionFilter(rows, noOpts);
  assert.equal(result.length, 0);
  // Restore for any future tests.
  setAll(true);
});
