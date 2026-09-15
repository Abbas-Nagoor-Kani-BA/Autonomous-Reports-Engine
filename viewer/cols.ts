import { removeValue, saveValue } from "../lib/storage.ts";
import { STORAGE } from "../lib/keys.ts";
import { showToast } from "../lib/toast.ts";
import { iconize } from "../lib/icons.ts";
import { setHiddenCols, setColOrder, saveColOrder } from "./store.ts";
import { buildHead, load, render, resetColWidths } from "./grid.ts";
import { closeColumnEditor } from "./column-editor.ts";
import { $, hideStore, orderedCols, setColumnVisible, setStatus } from "./core.ts";
import { reorderKeys } from "./col-order.ts";

function updateColsBtn(): void {
  const btn = $("colsBtn");
  const n = hideStore().size;
  // Icon-only button: show the hidden count as a badge + in the tooltip, not text.
  btn.classList.toggle("has-badge", n > 0);
  btn.setAttribute("data-badge", n > 0 ? String(n) : "");
  btn.setAttribute("data-tip", n > 0
    ? `Choose which columns are shown (${n} hidden)`
    : "Choose which columns are shown");
}

export function initCols(): void {
  $("colsBtn").textContent = "Columns";
  iconize($("colsBtn"), "columns-3", { tip: "Choose which columns are shown" });
  $("clearBtn").textContent = "Clear";
  iconize($("clearBtn"), "trash-2", { tip: "Clear pulled data" });
  iconize($("showAllCols"), "check-circle-2");
  iconize($("resetColWidthsBtn"), "rotate-ccw");
  iconize($("resetColOrderBtn"), "rotate-ccw");

  $("clearBtn").addEventListener("click", async () => {
    await removeValue(STORAGE.lastData);
    load(null);
    closeColumnEditor();
    showToast("Pull data cleared");
  });

  $("colsBtn").addEventListener("click", (e: Event) => {
    e.stopPropagation();
    const menu = $("colMenu");
    if (menu.classList.contains("hidden")) {
      buildColMenu();
      $("colSearch").value = "";
      setTimeout(() => $("colSearch").focus(), 0);
    }
    menu.classList.toggle("hidden");
  });

  $("colSearch").addEventListener("input", (e: Event) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    for (const lab of $("colList").children) {
      lab.style.display = !q || lab.textContent.toLowerCase().includes(q) ? "" : "none";
    }
  });

  $("showAllCols").addEventListener("click", async () => {
    setHiddenCols(new Set());
    try {
      await saveValue(STORAGE.viewerHiddenCols, []);
    } catch { /* ignored */ }
    $("colMenu").classList.add("hidden");
    buildHead();
    render();
    updateColsBtn();
    setStatus("All columns visible");
  });

  $("resetColWidthsBtn").addEventListener("click", () => {
    resetColWidths();
    setStatus("Column widths reset");
  });

  $("resetColOrderBtn").addEventListener("click", () => {
    setColOrder([]);
    saveColOrder();
    buildHead();
    render();
    if (!$("colMenu").classList.contains("hidden")) buildColMenu();
    setStatus("Column order reset");
  });
}

function buildColMenu(): void {
  const list = $("colList");
  list.innerHTML = "";
  // Iterate the columns in the user's chosen order (incl. hidden) so the menu
  // list both REFLECTS and CONTROLS the display order.
  for (const [key, label] of orderedCols()) {
    const lab = document.createElement("label");
    lab.className = "colRow";
    lab.dataset.colKey = key;
    lab.draggable = true;

    const grip = document.createElement("span");
    grip.className = "colGrip";
    grip.textContent = "\u2261"; // ≡ drag affordance
    grip.setAttribute("aria-hidden", "true");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !hideStore().has(key);
    // A pointerdown on the checkbox must not begin a row drag.
    cb.addEventListener("pointerdown", () => { dragSuppressed = true; });
    cb.addEventListener("change", () => toggleCol(key, cb.checked));

    const span = document.createElement("span");
    span.className = "colName";
    span.textContent = label;

    lab.append(grip, cb, span);
    wireRowDrag(lab, key);
    list.appendChild(lab);
  }
}

/**
 * Transient drag-to-sort state for the Columns menu. Module-level so it does
 * not force a rebuild mid-drag. `dragSuppressed` blocks a drag that began on
 * the checkbox (so toggling visibility never starts a reorder).
 */
let menuDragKey: string | null = null;
let dragSuppressed = false;

function clearRowIndicators(): void {
  for (const row of $("colList").children) {
    (row as HTMLElement).classList.remove("drop-above", "drop-below");
  }
}

/** True when the pointer is in the top half of `row` (insert above). */
function dragAbove(e: DragEvent, row: HTMLElement): boolean {
  const rect = row.getBoundingClientRect();
  return (e.clientY - rect.top) < rect.height / 2;
}

function wireRowDrag(row: HTMLElement, key: string): void {
  row.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement | null;
    // Only a press on the row body/grip starts a drag; the checkbox suppresses.
    if (t && t.closest("input")) return;
    dragSuppressed = false;
  });

  row.addEventListener("dragstart", (e) => {
    if (dragSuppressed) { dragSuppressed = false; e.preventDefault(); return; }
    menuDragKey = key;
    row.classList.add("row-dragging");
    try {
      (e as DragEvent).dataTransfer?.setData("text/plain", key);
      (e as DragEvent).dataTransfer!.effectAllowed = "move";
    } catch { /* best-effort */ }
  });

  row.addEventListener("dragover", (e) => {
    if (menuDragKey === null || menuDragKey === key) return;
    e.preventDefault();
    try { (e as DragEvent).dataTransfer!.dropEffect = "move"; } catch { /* best-effort */ }
    const above = dragAbove(e as DragEvent, row);
    clearRowIndicators();
    row.classList.add(above ? "drop-above" : "drop-below");
  });

  row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));

  row.addEventListener("drop", (e) => {
    if (menuDragKey === null || menuDragKey === key) return;
    e.preventDefault();
    const above = dragAbove(e as DragEvent, row);
    const from = menuDragKey;
    clearRowIndicators();
    applyReorder(from, key, above);
  });

  row.addEventListener("dragend", () => {
    row.classList.remove("row-dragging");
    clearRowIndicators();
    menuDragKey = null;
    dragSuppressed = false;
  });
}

/** Move column `fromKey` before/after `toKey`, persist, and re-render grid + menu. */
function applyReorder(fromKey: string, toKey: string, placeBefore: boolean): void {
  const nextOrder = reorderKeys(orderedCols(), fromKey, toKey, placeBefore);
  setColOrder(nextOrder);
  saveColOrder();
  buildHead();
  render();
  buildColMenu();
}

async function toggleCol(key: string, show: boolean): Promise<void> {
  if (!setColumnVisible(key, show)) {
    setStatus("At least one column must stay visible", true);
    buildColMenu();
    return;
  }
  buildHead();
  render();
  updateColsBtn();
}