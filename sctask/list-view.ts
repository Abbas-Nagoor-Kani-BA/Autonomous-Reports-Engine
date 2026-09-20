import { el } from "../common/components/component.ts";
import type { SctaskRow } from "../services/sctask-bulk-service.ts";

/** Column headers for the SCTASK list. Checkbox column is added in Task 7. */
const COLUMNS: [keyof SctaskRow, string][] = [
  ["number", "Number"],
  ["shortDescription", "Short description"],
  ["state", "State"],
  ["assignmentGroup", "Assignment group"],
  ["assignedTo", "Assigned to"],
  ["updatedOn", "Updated"]
];

/**
 * Renders the SCTASK list into a plain table and owns its status line.
 *
 * Deliberately framework-free and DOM-only (no chrome, no messaging) so it can
 * be unit-tested under happy-dom. The bootstrap feeds it rows/status; selection
 * and inputs layer on in later tasks.
 */
export class SctaskListView {
  private readonly table: HTMLTableElement;
  private readonly status: HTMLElement;
  private rows: SctaskRow[] = [];

  constructor(deps: { table: HTMLTableElement; status: HTMLElement }) {
    this.table = deps.table;
    this.status = deps.status;
  }

  /** Shows a status message and hides the table (loading / empty / error). */
  setStatus(message: string): void {
    this.status.textContent = message;
    this.status.classList.remove("hidden");
    this.table.classList.add("hidden");
  }

  /** Replaces the table body with the given rows, or shows an empty message. */
  render(rows: SctaskRow[]): void {
    this.rows = rows;
    if (!rows.length) {
      this.setStatus("No SCTASKs found for this scope.");
      return;
    }
    this.status.classList.add("hidden");
    this.table.classList.remove("hidden");
    this.table.replaceChildren(this.#head(), this.#body(rows));
  }

  /** Current rows (for later selection wiring). */
  getRows(): SctaskRow[] {
    return this.rows;
  }

  #head(): HTMLTableSectionElement {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    for (const [, label] of COLUMNS) {
      const th = el("th", "px-2 py-1.5 border-b border-line text-muted font-semibold", label);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    return thead;
  }

  #body(rows: SctaskRow[]): HTMLTableSectionElement {
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const tr = el("tr", "border-b border-line/50");
      tr.dataset.sysId = row.sysId;
      for (const [key] of COLUMNS) {
        tr.appendChild(el("td", "px-2 py-1.5 align-top", String(row[key] ?? "")));
      }
      tbody.appendChild(tr);
    }
    return tbody;
  }
}
