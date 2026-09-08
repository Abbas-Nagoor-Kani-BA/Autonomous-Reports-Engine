import { $, el } from "./core.ts";
import { currentRows } from "./grid-data.ts";
import { render } from "./grid.ts";
import { getCiSplit } from "./config-state.ts";
import { exportSvc } from "./exporter.ts";
import { getActiveSplitGroup, setActiveSplitGroup, setSplitBucketer } from "./split-filter.ts";
import { Modal } from "../../components/modal.ts";
import { iconize } from "../../lib/icons.ts";
import type { ViewerRow } from "./core.ts";

let modal: Modal;

/** Rows for the split, ignoring any active group filter (so the preview always
 *  reflects the whole searched view, not the already-scoped grid). */
function previewRows(): ViewerRow[] {
  const active = getActiveSplitGroup();
  setActiveSplitGroup(null);
  const rows = currentRows();
  setActiveSplitGroup(active);
  return rows;
}

function applyGroup(name: string | null): void {
  setActiveSplitGroup(name);
  render();
  updateSplitChip();
  modal.close();
}

function renderPreview(): void {
  const body = $("splitPreviewBody") as HTMLElement;
  body.innerHTML = "";

  const rows = previewRows();
  const groups = getCiSplit().groups;

  const head = el("div", "stats-h");
  if (!groups.length) {
    head.textContent = `No groups defined — ${rows.length} ticket${rows.length === 1 ? "" : "s"} ungrouped`;
    body.appendChild(head);
    body.appendChild(rowFor("Ungrouped (all)", rows.length, null));
    const note = el("div", "text-dim text-[11.5px] mt-1");
    note.textContent = "Edit groups in the export dialog to split the data.";
    body.appendChild(note);
    return;
  }

  const buckets = exportSvc.buildCiGroups(rows, groups);
  const others = buckets.find((b) => b.name === "Others");
  head.textContent = `${buckets.length} bucket${buckets.length === 1 ? "" : "s"} · ${rows.length} ticket${rows.length === 1 ? "" : "s"}${others ? ` · ${others.rows.length} in Others` : ""}`;
  body.appendChild(head);

  const list = el("div", "splitList");
  const allRow = rowFor("All (clear filter)", rows.length, null);
  allRow.classList.add("splitAll");
  list.appendChild(allRow);
  for (const b of buckets) {
    list.appendChild(rowFor(b.name, b.rows.length, b.name));
  }
  body.appendChild(list);
}

function rowFor(label: string, count: number, groupName: string | null): HTMLElement {
  const row = el("div", "splitRow");
  if (groupName !== null && getActiveSplitGroup() === groupName) row.classList.add("active");
  const name = el("span", "splitName");
  name.textContent = label;
  const cnt = el("span", "splitCount");
  cnt.textContent = String(count);
  const view = document.createElement("button");
  view.type = "button";
  view.className = "btn splitView";
  view.textContent = groupName === null ? "Show all" : "View in grid";
  view.addEventListener("click", () => applyGroup(groupName));
  row.append(name, cnt, view);
  return row;
}

export function updateSplitChip(): void {
  const chip = $("splitChip");
  if (!chip) return;
  const active = getActiveSplitGroup();
  if (active) {
    chip.classList.remove("hidden");
    const label = chip.querySelector(".splitChipLabel");
    if (label) label.textContent = `Split: ${active}`;
  } else {
    chip.classList.add("hidden");
  }
}

export function openSplitPreview(): void {
  const groups = getCiSplit().groups;
  const active = getActiveSplitGroup();
  if (active && !groups.some((g) => g.name === active) && active !== "Others") {
    setActiveSplitGroup(null);
    render();
    updateSplitChip();
  }
  renderPreview();
  modal.open();
}

export function initSplitPreview(): void {
  setSplitBucketer((rows, group) => {
    const hit = exportSvc.buildCiGroups(rows, getCiSplit().groups).find((b) => b.name === group);
    return hit ? [...hit.rows] : [];
  });
  modal = new Modal($("splitPreviewModal"), {}, {});
  const btn = $("splitPreviewBtn") as HTMLButtonElement;
  iconize(btn, "columns-3", { mode: "icon", tip: "Preview export split", label: "Preview export split" });
  btn.addEventListener("click", () => openSplitPreview());
  const close = $("splitPreviewClose");
  if (close) close.addEventListener("click", () => modal.close());
  const chipClear = $("splitChipClear");
  if (chipClear) chipClear.addEventListener("click", () => applyGroup(null));
  updateSplitChip();
}
