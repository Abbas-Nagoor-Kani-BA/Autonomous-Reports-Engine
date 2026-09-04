import assert from "node:assert/strict";
import { test } from "node:test";
import "./helpers/dom-env.mjs";
import { ChipList } from "../components/chip-list.ts";
import { mergeMsrLists } from "../core/msrchoices.ts";
import { classifyMsr, norm } from "../core/msrcategorize.ts";
import {
  rebuildKeywordChips,
  fillMsrLists,
  collectMsrLists
} from "../surfaces/settings/index.ts";

function makeWiring() {
  const stack = document.createElement("div");
  document.body.appendChild(stack);
  const mk = (id) => new ChipList(document.createElement("div"), {}, { collapsible: true });
  const chips = {};
  for (const id of [
    "msrOpCo", "msrDomain", "msrType", "msrStatus", "msrResolution",
    "msrDuplicate", "msrQueue", "msrSubCategory",
    "msrRcIncident", "msrRcRfs", "msrRcPTicket"
  ]) chips[id] = mk(id);
  return {
    chips,
    kwChips: {},
    kwTiles: {},
    kwStack: stack,
    msrFieldIds: {
      lists: [
        ["opCo", "msrOpCo"], ["domain", "msrDomain"], ["type", "msrType"],
        ["status", "msrStatus"], ["resolution", "msrResolution"],
        ["duplicate", "msrDuplicate"], ["queue", "msrQueue"], ["subCategory", "msrSubCategory"]
      ],
      rootCause: [["Incident", "msrRcIncident"], ["RFS", "msrRcRfs"], ["P_Ticket", "msrRcPTicket"]]
    }
  };
}

test("norm produces the classifier hint key from a display label", () => {
  assert.equal(norm("Application bug"), "application bug");
  assert.equal(norm("User error - procedure"), "user error procedure");
  assert.equal(norm("Job schedule/scheduler error"), "job schedule scheduler error");
});

test("merged defaults carry hints under the normalised key", () => {
  const merged = mergeMsrLists(null);
  const hint = merged.hints[norm("Application bug")];
  assert.ok(Array.isArray(hint) && hint.length > 0, "default hints present for Application bug");
});

test("fillMsrLists pre-populates each label's chips with its built-in defaults", () => {
  const wiring = makeWiring();
  const lists = mergeMsrLists(null);
  fillMsrLists(wiring, lists);

  const expected = lists.hints[norm("Application bug")];
  const chip = wiring.kwChips["Application bug"];
  assert.ok(chip, "a chip tile exists for the Application bug label");
  assert.deepEqual(chip.getValues(), expected);

  const rfsChip = wiring.kwChips["Workaround solution"];
  assert.ok(rfsChip, "a chip tile exists for the resolution label");
  assert.deepEqual(rfsChip.getValues(), lists.hints[norm("Workaround solution")]);
});

test("collectMsrLists stores edited keywords under the normalised key", () => {
  const wiring = makeWiring();
  const lists = mergeMsrLists(null);
  fillMsrLists(wiring, lists);

  wiring.kwChips["Application bug"].setValues(["stack trace", "npe", "null pointer"]);
  const collected = collectMsrLists(wiring);

  assert.deepEqual(collected.lists.hints[norm("Application bug")], ["stack trace", "npe", "null pointer"]);
  assert.equal(collected.lists.hints["Application bug"], undefined, "not stored under the raw label");
});

test("edited keywords round-trip through the classifier", () => {
  const wiring = makeWiring();
  const lists = mergeMsrLists(null);
  fillMsrLists(wiring, lists);

  wiring.kwChips["Application bug"].setValues(["frobnicator meltdown", "frobnicator meltdown two"]);
  const collected = collectMsrLists(wiring);

  const labels = ["Application bug", "Network issue"];
  const res = classifyMsr("The frobnicator meltdown two happened after a frobnicator meltdown", labels, {
    hints: collected.lists.hints,
    useRegex: false
  });
  assert.equal(res.label, "Application bug");
});

test("collectMsrLists output satisfies the msrLists import validation shape", () => {
  const wiring = makeWiring();
  fillMsrLists(wiring, mergeMsrLists(null));
  const collected = collectMsrLists(wiring);

  const isArr = (x) => Array.isArray(x) && x.every((y) => typeof y === "string");
  const hints = collected.lists.hints;
  assert.equal(typeof hints === "object" && !Array.isArray(hints), true);
  for (const [label, arr] of Object.entries(hints)) {
    assert.equal(typeof label, "string");
    assert.equal(isArr(arr), true, `hint list for ${label} is a string[]`);
  }
});

test("rebuildKeywordChips drops tiles for labels no longer in the lists", () => {
  const wiring = makeWiring();
  const lists = mergeMsrLists(null);
  rebuildKeywordChips(wiring, lists);
  assert.ok(wiring.kwChips["Application bug"], "seeded from full lists");

  const trimmed = { ...lists, rootCause: { Incident: [], RFS: [], P_Ticket: [] }, resolution: [] };
  rebuildKeywordChips(wiring, trimmed);
  assert.equal(wiring.kwChips["Application bug"], undefined, "tile removed when label leaves the lists");
});
