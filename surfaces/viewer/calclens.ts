/**
 * Calclens — viewer wiring.
 *
 * Owns the toolbar toggle button and the right-side drawer, and routes the
 * currently-selected grid cell to the pure explainer in core/calclens.ts. The
 * grid body is always read-only; the drawer also edits the derivation columns.
 */
import { $, columnOptionList, visibleCols } from "./core.ts";
import { findRowBySysId, fmtInstant, parseLocalInput, render, reportCellFocus, scheduleSave, setOnCellFocus } from "./grid.ts";
import { currentRows } from "./grid-data.ts";
import { setSelPoint } from "./selection.ts";
import { getMsrLists } from "./store.ts";
import { getCalclensMode, setCalclensMode } from "./calclens-state.ts";
import { getEditMode } from "./edit-mode-state.ts";
import {
  disabledCount,
  isHighlightEnabled,
  loadHighlightPrefs,
  setAll,
  setHighlightEnabled
} from "./calclens-highlights.ts";
import { getAttentionFilterActive, setAttentionFilterActive } from "./attention-filter.ts";
import { ATTENTION_RULES } from "../../core/attention.ts";
import { explainCell } from "../../core/calclens.ts";
import { CalclensPanel } from "../../components/calclens-panel.ts";
import { activityPaneEl } from "./activity.ts";
import { showToast } from "../../lib/toast.ts";
import { iconize } from "../../lib/icons.ts";

let panel: CalclensPanel;

function colClass(key: string): string {
  return visibleCols().find((c) => c[0] === key)?.[2] ?? "";
}

export function initCalclens(): void {
  const btn = $("calclensBtn");
  const host = $("calclensPanel");
  btn.textContent = "Calclens";
  iconize(btn, "info");
  $("calclensMenuBtn").textContent = "Highlights";
  iconize($("calclensMenuBtn"), "list");

  const filterBtn = $("calclensFilterBtn");
  filterBtn.textContent = "Flagged only";
  iconize(filterBtn, "filter");

  panel = new CalclensPanel(host, {}, {
    optionsFor: (key, row) => columnOptionList(key, row),
    displayFor: (key, row, cls) => (cls === "inst" ? fmtInstant(String(row[key] ?? ""), row) : String(row[key] ?? "")),
    parseValue: (v) => parseLocalInput(v),
    activityFor: (row) => activityPaneEl(row),
    onCommit: (key, value, row) => {
      row[key] = value;
      scheduleSave();
      render();
      showToast("Saved");
      // Re-show so the freshly-edited derivation re-marks the picked timeline
      // step as `selected` and the Timeline strip reflects the new value.
      try {
        const ex = explainCell(row, key, { fmtInstant, msrLists: getMsrLists() });
        panel.show(ex, { row, key, cls: colClass(key) });
      } catch { /* keep the drawer as-is */ }
    },
    onJumpToCell: (sysId, key) => {
      setSelPoint(sysId, key, false);
      reportCellFocus({ sysId, key });
    }
  });

  btn.addEventListener("click", () => {
    const next = !getCalclensMode();
    setCalclensMode(next);
    btn.classList.toggle("calclens-on", next);
    updateCalclensControls(next);
    render();
    if (!next) {
      panel.close();
      // Clear the attention filter when Calclens is turned off so the grid
      // always returns to full view when Calclens is inactive.
      setAttentionFilterActive(false);
      render();
      updateFilterBtn();
    }
  });

  setOnCellFocus((info) => {
    if (!getCalclensMode()) return;
    if (getEditMode()) { panel.close(); return; }
    const row = info ? findRowBySysId(info.sysId) : undefined;
    if (!info || !row) {
      panel.show(null);
      return;
    }
    try {
      const ex = explainCell(row, info.key, { fmtInstant, msrLists: getMsrLists() });
      panel.show(ex, { row, key: info.key, cls: colClass(info.key) });
    } catch {
      panel.show(null);
    }
  });

  // Filter button: toggle the attention filter. Only reachable when Calclens
  // is ON (the button is hidden otherwise).
  filterBtn.addEventListener("click", () => {
    setAttentionFilterActive(!getAttentionFilterActive());
    render();
    updateFilterBtn();
  });

  // Dismiss the attention filter from the tab-bar chip.
  $("attentionChipClear").addEventListener("click", () => {
    setAttentionFilterActive(false);
    render();
    updateFilterBtn();
  });

  // Reflect the persisted mode on boot.
  btn.classList.toggle("calclens-on", getCalclensMode());
  updateCalclensControls(getCalclensMode());

  initCalclensHighlights();
  updateFilterBtn();
}

/** Update the Calclens button to show how many highlights are hidden (badge + tooltip). */
function updateCalclensBtn(): void {
  const btn = $("calclensBtn");
  const hidden = disabledCount();
  btn.classList.toggle("has-badge", hidden > 0);
  btn.setAttribute("data-badge", hidden > 0 ? String(hidden) : "");
  btn.setAttribute("data-tip", hidden > 0
    ? `Calclens — inspect how each value was derived (${hidden} highlight${hidden === 1 ? "" : "s"} hidden)`
    : "Calclens — inspect how each value was derived and edit the derivation columns");
}

/**
 * Show or hide the Calclens secondary controls in the tabs bar
 * (Highlights button+menu wrapper and Flagged-only button). Called whenever
 * Calclens mode changes so the controls only appear when Calclens is ON.
 */
function updateCalclensControls(on: boolean): void {
  $("calclensMenuWrap").classList.toggle("hidden", !on);
  $("calclensFilterBtn").classList.toggle("hidden", !on);
  // If Calclens is turned off, also close the Highlights dropdown so it
  // doesn't stay open floating over the page.
  if (!on) $("calclensMenu").classList.add("hidden");
}

/**
 * Sync the "Flagged only" filter button and the tab-bar chip to the current
 * filter state. Called after every toggle of the filter, highlights, or
 * Calclens mode.
 */
function updateFilterBtn(): void {
  const filterBtn = $("calclensFilterBtn");
  const active = getAttentionFilterActive();
  filterBtn.classList.toggle("calclens-filter-on", active);
  if (active) {
    const shown = currentRows().length;
    filterBtn.setAttribute("data-tip",
      `Showing ${shown} flagged ticket${shown === 1 ? "" : "s"} — click to clear filter`);
  } else {
    filterBtn.setAttribute("data-tip",
      "Show only tickets with attention flags (Calclens must be on)");
  }

  // Tab-bar chip mirrors the filter state.
  const chip = $("attentionChip");
  const chipLabel = $("attentionChipLabel");
  if (active) {
    const shown = currentRows().length;
    chipLabel.textContent = `⚑ ${shown} flagged`;
    chip.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
  }
}

/** Rebuilds the highlight-toggle checkbox list from the canonical rules. */
function buildCalclensHlList(): void {
  const list = $("calclensHlList");
  list.innerHTML = "";
  for (const { id, label } of ATTENTION_RULES) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isHighlightEnabled(id);
    cb.addEventListener("change", () => {
      setHighlightEnabled(id, cb.checked);
      render();
      updateCalclensBtn();
      updateFilterBtn();
    });
    const span = document.createElement("span");
    span.textContent = label;
    lab.append(cb, span);
    list.appendChild(lab);
  }
}

/** Wires the highlight-toggle dropdown next to the Calclens button. The menu is
 *  always openable, letting users pre-configure before turning Calclens on. */
function initCalclensHighlights(): void {
  const menuBtn = $("calclensMenuBtn");
  const menu = $("calclensMenu");

  updateCalclensBtn();
  // The persisted prefs load asynchronously (see grid.ts initGrid); refresh the
  // button's hidden-count once they settle so the indicator matches storage.
  loadHighlightPrefs().then(() => updateCalclensBtn()).catch(() => undefined);

  menuBtn.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    if (menu.classList.contains("hidden")) buildCalclensHlList();
    menu.classList.toggle("hidden");
  });

  // Keep clicks inside the menu from bubbling to the document dismissal below.
  menu.addEventListener("click", (e: Event) => e.stopPropagation());

  $("calclensShowAll").addEventListener("click", () => {
    setAll(true);
    buildCalclensHlList();
    render();
    updateCalclensBtn();
    updateFilterBtn();
  });
  $("calclensHideAll").addEventListener("click", () => {
    setAll(false);
    buildCalclensHlList();
    render();
    updateCalclensBtn();
    updateFilterBtn();
  });

  document.addEventListener("click", (e: Event) => {
    if (!menu.classList.contains("hidden") && !menu.contains(e.target as Node) && e.target !== menuBtn) {
      menu.classList.add("hidden");
    }
  });
}
