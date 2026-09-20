import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

// Load the real page HTML, minus scripts/stylesheets (happy-dom would fetch them).
const html = readFileSync(new URL("../sctask/sctask.html", import.meta.url), "utf8")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<link[^>]*>/gi, "");

const win = new Window({ url: "https://sctask.local/" });
globalThis.window = win as never;
globalThis.document = win.document as never;
globalThis.HTMLElement = win.HTMLElement as never;
globalThis.HTMLTableElement = win.HTMLTableElement as never;
win.document.body.innerHTML = html;

const { SctaskListView } = await import("../sctask/list-view.ts");

function freshView() {
  win.document.body.innerHTML = html;
  const table = win.document.getElementById("sctaskTable") as unknown as HTMLTableElement;
  const status = win.document.getElementById("listStatus") as unknown as HTMLElement;
  return { view: new SctaskListView({ table, status }), table, status };
}

const ROWS = [
  {
    sysId: "s1",
    number: "SCTASK0001",
    shortDescription: "Reset VPN",
    state: "Open",
    assignmentGroup: "Service Desk",
    assignedTo: "Alice",
    updatedOn: "2026-09-01"
  },
  {
    sysId: "s2",
    number: "SCTASK0002",
    shortDescription: "Install SAP",
    state: "WIP",
    assignmentGroup: "Service Desk",
    assignedTo: "Alice",
    updatedOn: "2026-09-02"
  }
];

test("render draws one row per SCTASK and shows the table", () => {
  const { view, table, status } = freshView();
  view.render(ROWS);
  assert.ok(!table.classList.contains("hidden"), "table should be visible");
  assert.ok(status.classList.contains("hidden"), "status should be hidden");
  const bodyRows = table.querySelectorAll("tbody tr");
  assert.equal(bodyRows.length, 2);
  assert.equal((bodyRows[0] as HTMLElement).dataset.sysId, "s1");
  assert.match(table.textContent || "", /SCTASK0001/);
  assert.match(table.textContent || "", /Reset VPN/);
});

test("render with no rows shows the empty message and hides the table", () => {
  const { view, table, status } = freshView();
  view.render([]);
  assert.ok(table.classList.contains("hidden"));
  assert.ok(!status.classList.contains("hidden"));
  assert.match(status.textContent || "", /no sctasks/i);
});

test("setStatus shows a message and hides the table", () => {
  const { view, table, status } = freshView();
  view.render(ROWS);
  view.setStatus("Loading…");
  assert.ok(table.classList.contains("hidden"));
  assert.equal(status.textContent, "Loading…");
});

test("getRows returns the last rendered rows", () => {
  const { view } = freshView();
  view.render(ROWS);
  assert.equal(view.getRows().length, 2);
  assert.equal(view.getRows()[1].number, "SCTASK0002");
});
