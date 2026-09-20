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
globalThis.HTMLInputElement = win.HTMLInputElement as never;
globalThis.Event = win.Event as never;
win.document.body.innerHTML = html;

const { SctaskListView } = await import("../sctask/list-view.ts");

function freshView(events = {}) {
  win.document.body.innerHTML = html;
  const table = win.document.getElementById("sctaskTable") as unknown as HTMLTableElement;
  const status = win.document.getElementById("listStatus") as unknown as HTMLElement;
  return { view: new SctaskListView({ table, status }, events), table, status };
}

function row(sysId: string, number: string, short: string, state = "Open", group = "Service Desk") {
  return {
    sysId,
    number,
    shortDescription: short,
    state,
    assignmentGroup: group,
    assignedTo: "Alice",
    updatedOn: "2026-09-01"
  };
}

const ROWS = [
  row("s1", "SCTASK0001", "Reset VPN access"),
  row("s2", "SCTASK0002", "Install SAP GUI", "WIP"),
  row("s3", "SCTASK0003", "Provision mailbox", "Open", "Messaging")
];

function bodyCheckboxes(table: HTMLTableElement): HTMLInputElement[] {
  return [...table.querySelectorAll("tbody .rowCheck")] as unknown as HTMLInputElement[];
}
function headerCheckbox(table: HTMLTableElement): HTMLInputElement {
  return table.querySelector("thead input[type=checkbox]") as unknown as HTMLInputElement;
}

test("render draws one row per SCTASK plus a checkbox column, and shows the table", () => {
  const { view, table, status } = freshView();
  view.render(ROWS);
  assert.ok(!table.classList.contains("hidden"));
  assert.ok(status.classList.contains("hidden"));
  assert.equal(table.querySelectorAll("tbody tr").length, 3);
  assert.equal(bodyCheckboxes(table).length, 3);
  assert.match(table.textContent || "", /SCTASK0001/);
});

test("empty rows shows the empty message", () => {
  const { view, table, status } = freshView();
  view.render([]);
  assert.ok(table.classList.contains("hidden"));
  assert.match(status.textContent || "", /no sctasks found/i);
});

test("ticking a row checkbox updates getSelected and fires selectionChange", () => {
  const counts: { selected: number; total: number }[] = [];
  const { view, table } = freshView({ selectionChange: (c: never) => counts.push(c) });
  view.render(ROWS);
  const boxes = bodyCheckboxes(table);
  boxes[1].checked = true;
  boxes[1].dispatchEvent(new win.Event("change"));
  assert.deepEqual(view.getSelected(), ["s2"]);
  assert.deepEqual(counts.at(-1), { selected: 1, total: 3 });
});

test("header select-all selects only the currently VISIBLE (filtered) rows", () => {
  const { view, table } = freshView();
  view.render(ROWS);
  view.setFilter("sap"); // matches only SCTASK0002 (Install SAP GUI)
  assert.equal(view.visibleRows().length, 1);
  const selectAll = headerCheckbox(table);
  selectAll.checked = true;
  selectAll.dispatchEvent(new win.Event("change"));
  assert.deepEqual(view.getSelected(), ["s2"]);
});

test("selection persists across filter changes (build up across searches)", () => {
  const { view, table } = freshView();
  view.render(ROWS);

  view.setFilter("vpn"); // SCTASK0001
  let selectAll = headerCheckbox(table);
  selectAll.checked = true;
  selectAll.dispatchEvent(new win.Event("change"));
  assert.deepEqual(view.getSelected(), ["s1"]);

  view.setFilter("mailbox"); // SCTASK0003
  selectAll = headerCheckbox(table);
  selectAll.checked = true;
  selectAll.dispatchEvent(new win.Event("change"));

  view.setFilter(""); // clear search
  assert.deepEqual(view.getSelected(), ["s1", "s3"]);
});

test("search matches across all columns (e.g. assignment group)", () => {
  const { view } = freshView();
  view.render(ROWS);
  view.setFilter("messaging"); // only s3's assignment group
  assert.deepEqual(
    view.visibleRows().map((r) => r.sysId),
    ["s3"]
  );
});

test("no rows match the search shows a distinct message", () => {
  const { view, table, status } = freshView();
  view.render(ROWS);
  view.setFilter("zzzznotfound");
  assert.ok(table.classList.contains("hidden"));
  assert.match(status.textContent || "", /match the search/i);
});

test("selectSysIds adds to the current selection (union) for 'select flagged'", () => {
  const { view, table } = freshView();
  view.render(ROWS);
  const boxes = bodyCheckboxes(table);
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new win.Event("change")); // s1 selected
  view.selectSysIds(["s3"]); // union
  assert.deepEqual(view.getSelected(), ["s1", "s3"]);
});

test("setFlagged badges the flagged rows", () => {
  const { view, table } = freshView();
  view.render(ROWS);
  view.setFlagged(["s2"]);
  const flaggedRow = table.querySelector('tbody tr[data-sys-id="s2"]') as unknown as HTMLElement;
  assert.match(flaggedRow.textContent || "", /no work note/i);
  assert.deepEqual(view.getFlagged(), ["s2"]);
});
