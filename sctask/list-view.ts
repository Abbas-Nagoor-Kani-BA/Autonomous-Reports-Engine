import { el } from "../common/components/component.ts";
import { setTip } from "../lib/tooltip.ts";
import type { SctaskRow } from "../services/sctask-bulk-service.ts";

/** Data columns (the checkbox column is rendered separately, first). */
const COLUMNS: [keyof SctaskRow, string][] = [
  ["number", "Number"],
  ["shortDescription", "Short description"],
  ["state", "State"],
  ["assignmentGroup", "Assignment group"],
  ["assignedTo", "Assigned to"],
  ["updatedOn", "Updated"]
];

export type SctaskListEvents = {
  /** Fires whenever the selection changes, with live counts. */
  selectionChange?: (info: { selected: number; total: number }) => void;
  /** Fires when a row's Edit affordance is clicked (per-ticket override popup). */
  onEdit?: (sysId: string) => void;
};

/**
 * Renders the SCTASK list with per-row checkboxes, a header select-all, and an
 * all-column search filter. Owns its status line.
 *
 * Selection is tracked in a `Set<sysId>` that is INDEPENDENT of the rendered
 * DOM, so it persists across filter changes: search "VPN", select all visible,
 * clear the search, search "SAP", select all visible — both sets remain
 * selected. Select-all only ever toggles the currently VISIBLE (filtered) rows.
 *
 * Framework-free and DOM-only so it is unit-testable under happy-dom.
 */
export class SctaskListView {
  private readonly table: HTMLTableElement;
  private readonly status: HTMLElement;
  private readonly events: SctaskListEvents;

  private rows: SctaskRow[] = [];
  private filterText = "";
  private readonly selected = new Set<string>();
  /** sysIds carrying a "no work note" flag (set in Task 13). */
  private readonly flagged = new Set<string>();
  /** sysIds that have a per-ticket override (edited via the popup). */
  private readonly overridden = new Set<string>();
  /** Per-ticket override text shown in the Comments/Work notes columns. */
  private overrideText = new Map<string, { comments: string; workNotes: string }>();

  constructor(deps: { table: HTMLTableElement; status: HTMLElement }, events: SctaskListEvents = {}) {
    this.table = deps.table;
    this.status = deps.status;
    this.events = events;
  }

  /** Shows a status message and hides the table (loading / empty / error). */
  setStatus(message: string): void {
    this.status.textContent = message;
    this.status.classList.remove("hidden");
    this.table.classList.add("hidden");
  }

  /** Replaces the list with new rows. Clears selection/flags/filter (fresh load). */
  render(rows: SctaskRow[]): void {
    this.rows = rows;
    this.selected.clear();
    this.flagged.clear();
    this.overridden.clear();
    this.overrideText = new Map();
    this.filterText = "";
    this.#draw();
  }

  /** Filters the visible rows across ALL columns (case-insensitive substring). */
  setFilter(text: string): void {
    this.filterText = String(text ?? "")
      .trim()
      .toLowerCase();
    this.#draw();
  }

  /** Rows currently matching the filter. */
  visibleRows(): SctaskRow[] {
    if (!this.filterText) return this.rows;
    const q = this.filterText;
    return this.rows.filter((r) =>
      COLUMNS.some(([key]) => String(r[key] ?? "").toLowerCase().includes(q))
    );
  }

  /** All loaded rows. */
  getRows(): SctaskRow[] {
    return this.rows;
  }

  /** Selected sysIds (persisted across filtering), in original row order. */
  getSelected(): string[] {
    return this.rows.map((r) => r.sysId).filter((id) => this.selected.has(id));
  }

  /** Adds the given sysIds to the current selection (union). Used by "select flagged". */
  selectSysIds(sysIds: string[]): void {
    for (const id of sysIds) if (id) this.selected.add(id);
    this.#draw();
  }

  /** Marks sysIds as flagged (no work note) so their rows show a badge. */
  setFlagged(sysIds: string[]): void {
    this.flagged.clear();
    for (const id of sysIds) if (id) this.flagged.add(id);
    this.#draw();
  }

  /** Currently flagged sysIds. */
  getFlagged(): string[] {
    return this.rows.map((r) => r.sysId).filter((id) => this.flagged.has(id));
  }

  /** Marks which sysIds have a per-ticket override so their rows show a badge. */
  setOverridden(sysIds: string[]): void {
    this.overridden.clear();
    for (const id of sysIds) if (id) this.overridden.add(id);
    this.#draw();
  }

  /**
   * Supplies the per-ticket override text to display in the Comments / Work
   * notes columns (the resolved override, i.e. what that ticket will post).
   * Also refreshes the "overridden" set from the map keys.
   */
  setOverrideText(map: Map<string, { comments: string; workNotes: string }>): void {
    this.overrideText = new Map(map);
    this.overridden.clear();
    for (const id of map.keys()) this.overridden.add(id);
    this.#draw();
  }

  /** sysIds that currently have an override. */
  getOverridden(): string[] {
    return this.rows.map((r) => r.sysId).filter((id) => this.overridden.has(id));
  }

  #emitSelection(): void {
    this.events.selectionChange?.({ selected: this.selected.size, total: this.rows.length });
  }

  #draw(): void {
    const visible = this.visibleRows();
    if (!this.rows.length) {
      this.setStatus("No SCTASKs found for this scope.");
      this.#emitSelection();
      return;
    }
    if (!visible.length) {
      this.setStatus("No SCTASKs match the search.");
      this.#emitSelection();
      return;
    }
    this.status.classList.add("hidden");
    this.table.classList.remove("hidden");
    this.table.replaceChildren(this.#head(visible), this.#body(visible));
    this.#emitSelection();
  }

  #head(visible: SctaskRow[]): HTMLTableSectionElement {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    const selectAll = el("input") as HTMLInputElement;
    selectAll.type = "checkbox";
    selectAll.className = "accent-accent";
    // Checked only when EVERY visible row is already selected.
    selectAll.checked = visible.every((r) => this.selected.has(r.sysId));
    selectAll.addEventListener("change", () => {
      for (const r of visible) {
        if (selectAll.checked) this.selected.add(r.sysId);
        else this.selected.delete(r.sysId);
      }
      this.#draw();
    });
    const thCheck = el("th", "px-2 py-1.5 border-b border-line w-8");
    thCheck.appendChild(selectAll);
    tr.appendChild(thCheck);

    for (const [, label] of COLUMNS) {
      tr.appendChild(
        el("th", "px-2 py-1.5 border-b border-line text-muted font-semibold", label)
      );
    }
    tr.appendChild(
      el("th", "px-2 py-1.5 border-b border-line text-muted font-semibold", "Comments")
    );
    tr.appendChild(
      el("th", "px-2 py-1.5 border-b border-line text-muted font-semibold", "Work notes")
    );
    tr.appendChild(el("th", "px-2 py-1.5 border-b border-line text-muted font-semibold w-16", ""));
    thead.appendChild(tr);
    return thead;
  }

  #body(visible: SctaskRow[]): HTMLTableSectionElement {
    const tbody = document.createElement("tbody");
    for (const row of visible) {
      const tr = el("tr", "border-b border-line/50");
      tr.dataset.sysId = row.sysId;

      const box = el("input") as HTMLInputElement;
      box.type = "checkbox";
      box.className = "accent-accent rowCheck";
      box.checked = this.selected.has(row.sysId);
      box.addEventListener("change", () => {
        if (box.checked) this.selected.add(row.sysId);
        else this.selected.delete(row.sysId);
        this.#emitSelection();
      });
      const tdCheck = el("td", "px-2 py-1.5 align-top");
      tdCheck.appendChild(box);
      tr.appendChild(tdCheck);

      for (const [key] of COLUMNS) {
        const td = el("td", "px-2 py-1.5 align-top", String(row[key] ?? ""));
        // "No work note" badge in the Number cell when flagged.
        if (key === "number" && this.flagged.has(row.sysId)) {
          td.appendChild(
            el(
              "span",
              "ml-2 text-[10px] uppercase tracking-wide bg-bad/20 text-[#f5e0dc] rounded px-1 py-0.5",
              "No work note"
            )
          );
        }
        tr.appendChild(td);
      }

      const ov = this.overrideText.get(row.sysId);
      tr.appendChild(this.#overrideCell(row.sysId, ov?.comments ?? ""));
      tr.appendChild(this.#overrideCell(row.sysId, ov?.workNotes ?? ""));

      const tdEdit = el("td", "px-2 py-1.5 align-top");
      const editLink = el("button", "linklike editLink", "Edit") as HTMLButtonElement;
      editLink.type = "button";
      editLink.addEventListener("click", () => this.events.onEdit?.(row.sysId));
      tdEdit.appendChild(editLink);
      if (this.overridden.has(row.sysId)) {
        tdEdit.appendChild(
          el(
            "span",
            "ml-1 text-[10px] uppercase tracking-wide bg-accent/20 text-accent rounded px-1 py-0.5 editedBadge",
            "Edited"
          )
        );
      }
      tr.appendChild(tdEdit);

      tbody.appendChild(tr);
    }
    return tbody;
  }

  /**
   * A Comments/Work notes column cell: shows the override text truncated to one
   * line, with the full text as a hover tooltip, and opens the override popup
   * when clicked (so the user edits per-ticket text there, not inline).
   */
  #overrideCell(sysId: string, text: string): HTMLTableCellElement {
    const td = el(
      "td",
      "px-2 py-1.5 align-top max-w-[220px] truncate cursor-pointer hover:text-accent overrideCell"
    ) as HTMLTableCellElement;
    td.textContent = text || "—";
    if (text) setTip(td, text);
    td.addEventListener("click", () => this.events.onEdit?.(sysId));
    return td;
  }
}
