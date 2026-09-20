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

test("clicking a row's Edit link fires onEdit with the sysId", () => {
  const edited: string[] = [];
  const { view, table } = freshView({ onEdit: (id: never) => edited.push(id) });
  view.render(ROWS);
  const editLinks = [...table.querySelectorAll("tbody .editLink")] as unknown as HTMLElement[];
  assert.equal(editLinks.length, 3);
  editLinks[1].dispatchEvent(new win.Event("click"));
  assert.deepEqual(edited, ["s2"]);
});

test("setOverridden badges the overridden rows with 'Edited'", () => {
  const { view, table } = freshView();
  view.render(ROWS);
  view.setOverridden(["s3"]);
  const row = table.querySelector('tbody tr[data-sys-id="s3"]') as unknown as HTMLElement;
  assert.match(row.textContent || "", /edited/i);
  assert.deepEqual(view.getOverridden(), ["s3"]);
  // a non-overridden row has no Edited badge
  const other = table.querySelector('tbody tr[data-sys-id="s1"]') as unknown as HTMLElement;
  assert.ok(!/edited/i.test((other.querySelector(".editedBadge")?.textContent as string) || ""));
});

test("flag then 'select flagged' adds flagged rows to the current selection (union)", () => {
  const { view, table } = freshView();
  view.render(ROWS);

  // User manually selects s1.
  const boxes = bodyCheckboxes(table);
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new win.Event("change"));

  // Flag action marks s2 + s3 as missing a work note.
  view.setFlagged(["s2", "s3"]);
  // Both flagged rows show the badge.
  assert.match(
    (table.querySelector('tbody tr[data-sys-id="s2"]') as unknown as HTMLElement).textContent || "",
    /no work note/i
  );

  // "Select flagged" = union of current selection and flagged rows.
  view.selectSysIds(view.getFlagged());
  assert.deepEqual(view.getSelected(), ["s1", "s2", "s3"]);
});

test("setOverrideText renders the Comments/Work notes columns with the override text", () => {
  const { view, table } = freshView();
  view.render(ROWS);
  view.setOverrideText(
    new Map([["s2", { comments: "cust text", workNotes: "internal text" }]])
  );
  const row = table.querySelector('tbody tr[data-sys-id="s2"]') as unknown as HTMLElement;
  const cells = [...row.querySelectorAll(".overrideCell")] as unknown as HTMLElement[];
  assert.equal(cells.length, 2);
  assert.equal(cells[0].textContent, "cust text");
  assert.equal(cells[1].textContent, "internal text");
  // full text available as a tooltip (data-tip) since cells truncate
  assert.equal(cells[0].getAttribute("data-tip"), "cust text");
  assert.equal(cells[1].getAttribute("data-tip"), "internal text");
  // a row without an override shows the placeholder
  const other = table.querySelector('tbody tr[data-sys-id="s1"]') as unknown as HTMLElement;
  const otherCells = [...other.querySelectorAll(".overrideCell")] as unknown as HTMLElement[];
  assert.equal(otherCells[0].textContent, "\u2014");
});

test("clicking an override cell opens the popup (fires onEdit)", () => {
  const edited: string[] = [];
  const { view, table } = freshView({ onEdit: (id: never) => edited.push(id) });
  view.render(ROWS);
  view.setOverrideText(new Map([["s1", { comments: "x", workNotes: "" }]]));
  const row = table.querySelector('tbody tr[data-sys-id="s1"]') as unknown as HTMLElement;
  const cell = row.querySelector(".overrideCell") as unknown as HTMLElement;
  cell.dispatchEvent(new win.Event("click"));
  assert.deepEqual(edited, ["s1"]);
});
