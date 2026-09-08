import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

const win = new Window({ url: "https://viewer.local/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement;
globalThis.HTMLSelectElement = win.HTMLSelectElement;
globalThis.KeyboardEvent = win.KeyboardEvent;
globalThis.MouseEvent = win.MouseEvent;
globalThis.Event = win.Event;
globalThis.Node = win.Node;

const { ColumnEditor } = await import("../components/column-editor.ts");

const entries = [
  { sysId: "s1", number: "INC0001", value: "Jane Doe" },
  { sysId: "s2", number: "INC0002", value: "Bob Roy" },
  { sysId: "s3", number: "INC0003", value: "" }
];

function mount(deps = {}) {
  win.document.body.innerHTML = `<div id="columnEditorModal" class="hidden"></div>`;
  const host = win.document.getElementById("columnEditorModal");
  const base = {
    activityFor: (sysId) => {
      const d = win.document.createElement("div");
      d.className = "actpane";
      d.textContent = `notes for ${sysId}`;
      return d;
    },
    displayFor: (_k, sysId) => `disp-${sysId}`,
    optionsFor: () => null,
    parseValue: (v) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.replace(" ", "T") + "Z") : null),
    onCommit: () => {},
    onFocusRow: () => {},
    flagsFor: () => [],
    isDerived: () => false
  };
  const editor = new ColumnEditor(host, {}, { ...base, ...deps });
  return { host, editor };
}

const q = (host, sel) => host.querySelectorAll(sel);
const rows = (host) => [...q(host, ".ce-right .ce-row:not(.ce-row-head)")];

test("show renders one right-side line per entry with numbers and values", () => {
  const { host, editor } = mount();
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  assert.equal(host.classList.contains("hidden"), false);
  const r = rows(host);
  assert.equal(r.length, 3);
  assert.equal(r[0].querySelector(".ce-num").textContent, "INC0001");
  assert.equal(r[0].querySelector(".ce-input").value, "Jane Doe");
  assert.equal(r[1].querySelector(".ce-input").value, "Bob Roy");
});

test("left pane renders the focused row's activity", () => {
  const { host, editor } = mount();
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  assert.match(host.querySelector(".ce-left").textContent, /notes for s1/);
});

test("editing a text input commits the raw value and bumps dirty count", () => {
  const committed = [];
  const { host, editor } = mount({ onCommit: (sysId, key, value) => committed.push([sysId, key, value]) });
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  const input = rows(host)[0].querySelector(".ce-input");
  input.value = "New Owner";
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.deepEqual(committed, [["s1", "assignedTo", "New Owner"]]);
  assert.match(host.querySelector(".ce-dirty").textContent, /1 edited/);
});

test("date columns parse input to ISO before commit; invalid stays uncommitted", () => {
  const committed = [];
  const { host, editor } = mount({ onCommit: (s, k, v) => committed.push(v) });
  editor.show({ colKey: "assignTimeUtcIso", colLabel: "Assign time", cls: "inst", entries, focusIdx: 0 });
  const input = rows(host)[0].querySelector(".ce-input");
  input.value = "not a date";
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(committed.length, 0);
  assert.equal(input.classList.contains("invalid"), true);
  input.value = "2026-01-02 03:04";
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(committed.length, 1);
  assert.match(committed[0], /^2026-01-02T03:04/);
});

test("choice columns render a select of options and commit the choice", () => {
  const committed = [];
  const { host, editor } = mount({
    optionsFor: () => ["Fix", "Workaround", "Other"],
    onCommit: (s, k, v) => committed.push(v)
  });
  editor.show({ colKey: "solutionType", colLabel: "Solution type", cls: "", entries, focusIdx: 0 });
  const sel = rows(host)[0].querySelector(".ce-input");
  assert.equal(sel.tagName, "SELECT");
  assert.ok([...sel.options].some((o) => o.value === "Workaround"));
  sel.value = "Workaround";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.deepEqual(committed, ["Workaround"]);
});

test("derived columns show the SLA note in the left pane", () => {
  const { host, editor } = mount({ isDerived: (k) => k === "assignTimeUtcIso" });
  editor.show({ colKey: "assignTimeUtcIso", colLabel: "Assign time", cls: "inst", entries, focusIdx: 0 });
  assert.match(host.querySelector(".ce-left").textContent, /Derived field/);
});

test("ArrowDown advances focus and refreshes the left pane; clamps at ends", () => {
  const focused = [];
  const { host, editor } = mount({ onFocusRow: (s) => focused.push(s) });
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  const right = host.querySelector(".ce-right");
  right.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.match(host.querySelector(".ce-left").textContent, /notes for s2/);
  assert.deepEqual(focused, ["s2"]);
  right.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  right.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.match(host.querySelector(".ce-left").textContent, /notes for s3/);
});

test("Calclens flags highlight the matching line with a reason tooltip", () => {
  const { host, editor } = mount({
    flagsFor: (sysId) => (sysId === "s2" ? [{ label: "Slow pickup" }] : [])
  });
  editor.show({ colKey: "assignTimeUtcIso", colLabel: "Assign time", cls: "inst", entries, focusIdx: 0 });
  const r = rows(host);
  assert.equal(r[0].classList.contains("ce-flagged"), false);
  assert.equal(r[1].classList.contains("ce-flagged"), true);
  assert.equal(r[1].getAttribute("data-tip"), "Slow pickup");
});

test("find filter narrows the right list by ticket number", () => {
  const { host, editor } = mount();
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  const find = host.querySelector("#ceFind");
  find.value = "0002";
  find.dispatchEvent(new win.Event("input", { bubbles: true }));
  const r = rows(host);
  assert.equal(r.length, 1);
  assert.equal(r[0].querySelector(".ce-num").textContent, "INC0002");
});

test("close hides the modal", () => {
  const { host, editor } = mount();
  editor.show({ colKey: "assignedTo", colLabel: "Assigned to", cls: "", entries, focusIdx: 0 });
  editor.close();
  assert.equal(host.classList.contains("hidden"), true);
});
