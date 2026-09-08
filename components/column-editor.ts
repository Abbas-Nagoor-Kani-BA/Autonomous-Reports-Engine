import { Component, el } from "./component.ts";
import type { ComponentProps } from "./component.ts";

export type ColumnEntry = { sysId: string; number: string; value: string };

export type ColumnEditorState = {
  open: boolean;
  colKey: string;
  colLabel: string;
  cls: string;
  entries: ColumnEntry[];
  focusIdx: number;
  dirtyCount: number;
  filter: string;
};

export type ColumnFlag = { label: string };

export type ColumnEditorDeps = {
  onClosed?: () => void;
  /** Left pane for a row (activity/timeline). */
  activityFor?: (sysId: string) => HTMLElement | null;
  /** Display value for a cell (instance formatter for "inst" cells). */
  displayFor?: (key: string, sysId: string, cls: string) => string;
  /** Option list for a choice column, or null if it is not a choice column. */
  optionsFor?: (key: string, sysId: string) => string[] | null;
  /** Parse a local-date input string; null if unparseable. */
  parseValue?: (v: string, key: string) => Date | null;
  /** Persist an edited value: raw string in, component formats display via displayFor. */
  onCommit?: (sysId: string, key: string, value: string) => void;
  /** Called when the focused row changes (so the caller can sync grid selection). */
  onFocusRow?: (sysId: string) => void;
  /** Calclens flags for a row+column, gated/filtered by the caller; empty when off. */
  flagsFor?: (sysId: string, key: string) => ColumnFlag[];
  /** True when the given column is a derived/date column (SLA-affecting). */
  isDerived?: (key: string) => boolean;
};

/**
 * The column editor modal. Selecting a grid cell opens it for that ONE column;
 * the right side lists that column's value for every row in the current view
 * (ticket number + one editable input), the left side shows the focused row's
 * activity/timeline. Arrow keys move the focus and refresh the left pane. Edits
 * auto-save per field. Built once; patch swaps content so input focus is kept.
 */
export class ColumnEditor extends Component<ColumnEditorState, ComponentProps, ColumnEditorDeps> {
  protected initialState(): ColumnEditorState {
    return { open: false, colKey: "", colLabel: "", cls: "", entries: [], focusIdx: 0, dirtyCount: 0, filter: "" };
  }

  protected build(): void {
    this.root.classList.add("hidden");
    this.root.innerHTML = "";

    const card = el("div", "ce-card");
    card.id = "columnEditorCard";

    const head = el("div", "ce-head");
    const title = el("span", "ce-title", "Edit column");
    const dirty = el("span", "ce-dirty hidden");
    dirty.id = "ceDirty";
    const find = el("input", "ce-find");
    find.id = "ceFind";
    (find as HTMLInputElement).type = "search";
    (find as HTMLInputElement).placeholder = "Find #\u2026";
    (find as HTMLInputElement).spellcheck = false;
    (find as HTMLInputElement).autocomplete = "off";
    find.addEventListener("input", () => this.onFilterInput((find as HTMLInputElement).value));
    const close = el("button", "ce-close", "\u2715");
    (close as HTMLButtonElement).type = "button";
    close.setAttribute("data-tip", "Close");
    close.addEventListener("click", () => this.close());
    head.append(title, dirty, find, close);
    card.appendChild(head);

    const body = el("div", "ce-body");
    const left = el("div", "ce-left");
    left.id = "ceLeft";
    const right = el("div", "ce-right");
    right.id = "ceRight";
    right.addEventListener("keydown", (e) => this.onListKeydown(e as KeyboardEvent));
    body.append(left, right);
    card.appendChild(body);

    this.root.appendChild(card);

    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
  }

  protected patch(next: ColumnEditorState): void {
    this.root.classList.toggle("hidden", !next.open);
    if (!next.open) {
      this.q<HTMLElement>(".ce-left").innerHTML = "";
      this.q<HTMLElement>(".ce-right").innerHTML = "";
      return;
    }
    this.q<HTMLElement>(".ce-title").textContent = next.colLabel ? `Edit column \u2014 "${next.colLabel}"` : "Edit column";
    this.renderDirty(next.dirtyCount);
    this.renderList(next);
    this.renderLeft(next);
  }

  protected renderDirty(n: number): void {
    const dirty = this.q<HTMLElement>(".ce-dirty");
    dirty.classList.toggle("hidden", n <= 0);
    dirty.textContent = n > 0 ? `${n} edited` : "";
  }

  protected renderLeft(next: ColumnEditorState): void {
    const left = this.q<HTMLElement>(".ce-left");
    left.innerHTML = "";
    const entry = next.entries[next.focusIdx];
    if (!entry) {
      left.appendChild(el("div", "ce-empty", "No rows to edit in the current view."));
      return;
    }
    const pane = this.deps.activityFor?.(entry.sysId) ?? null;
    if (pane) left.appendChild(pane);
    else left.appendChild(el("div", "ce-empty", "No activity for this ticket."));
    if (this.deps.isDerived?.(next.colKey)) {
      left.appendChild(el("div", "ce-derived-note", "\u26a0 Derived field \u2014 editing changes SLA results."));
    }
  }

  protected renderList(next: ColumnEditorState): void {
    const right = this.q<HTMLElement>(".ce-right");
    right.innerHTML = "";
    if (!next.entries.length) {
      right.appendChild(el("div", "ce-empty", "No rows in the current view."));
      return;
    }
    const headRow = el("div", "ce-row ce-row-head");
    headRow.append(el("span", "ce-num", "#"), el("span", "ce-val", next.colLabel || "Value"));
    right.appendChild(headRow);

    const filter = next.filter.trim().toLowerCase();
    for (let i = 0; i < next.entries.length; i++) {
      const entry = next.entries[i];
      if (filter && !entry.number.toLowerCase().includes(filter)) continue;
      right.appendChild(this.renderRow(next, entry, i));
    }
  }

  protected renderRow(next: ColumnEditorState, entry: ColumnEntry, i: number): HTMLElement {
    const row = el("div", "ce-row");
    if (i === next.focusIdx) row.classList.add("ce-focus");
    row.dataset.idx = String(i);

    const flags = this.deps.flagsFor?.(entry.sysId, next.colKey) ?? [];
    if (flags.length) {
      row.classList.add("ce-flagged");
      row.setAttribute("data-tip", flags.map((f) => f.label).join(" \u00b7 "));
    }

    const num = el("span", "ce-num", entry.number || "\u2014");
    row.appendChild(num);

    const options = this.deps.optionsFor?.(next.colKey, entry.sysId) ?? null;
    const control = options && options.length
      ? this.selectControl(next, entry, options)
      : this.textControl(next, entry);
    row.appendChild(control);

    row.addEventListener("focusin", () => this.focusTo(i));
    return row;
  }

  protected selectControl(next: ColumnEditorState, entry: ColumnEntry, options: string[]): HTMLElement {
    const sel = el("select", "ce-input");
    const cur = entry.value;
    const seen = new Set<string>();
    const blank = el("option", "", "");
    (blank as HTMLOptionElement).value = "";
    sel.appendChild(blank);
    for (const opt of options) {
      seen.add(opt);
      const o = el("option", "", opt);
      (o as HTMLOptionElement).value = opt;
      sel.appendChild(o);
    }
    if (cur && !seen.has(cur)) {
      const o = el("option", "", cur);
      (o as HTMLOptionElement).value = cur;
      sel.appendChild(o);
    }
    (sel as HTMLSelectElement).value = cur;
    sel.addEventListener("change", () => this.commit(next, entry, (sel as HTMLSelectElement).value));
    return sel;
  }

  protected textControl(next: ColumnEditorState, entry: ColumnEntry): HTMLElement {
    const input = el("input", "ce-input");
    (input as HTMLInputElement).type = "text";
    (input as HTMLInputElement).spellcheck = false;
    (input as HTMLInputElement).autocomplete = "off";
    const isInst = next.cls === "inst";
    const shown = isInst
      ? (this.deps.displayFor?.(next.colKey, entry.sysId, next.cls) ?? entry.value)
      : entry.value;
    (input as HTMLInputElement).value = shown;
    input.addEventListener("change", () => {
      const raw = (input as HTMLInputElement).value;
      if (isInst) {
        const t = raw.trim();
        if (!t) { this.commit(next, entry, ""); input.classList.remove("invalid"); return; }
        const parsed = this.deps.parseValue?.(t, next.colKey) ?? null;
        if (!parsed) { input.classList.add("invalid"); return; }
        input.classList.remove("invalid");
        this.commit(next, entry, parsed.toISOString());
      } else {
        this.commit(next, entry, raw);
      }
    });
    return input;
  }

  protected commit(next: ColumnEditorState, entry: ColumnEntry, value: string): void {
    if (value === entry.value) return;
    entry.value = value;
    this.deps.onCommit?.(entry.sysId, next.colKey, value);
    this.setState({ dirtyCount: this.getState().dirtyCount + 1 });
  }

  protected onFilterInput(v: string): void {
    this.setState({ filter: v });
  }

  protected onListKeydown(e: KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.moveFocus(-1);
    }
  }

  protected moveFocus(delta: number): void {
    const st = this.getState();
    const n = st.entries.length;
    if (!n) return;
    const idx = Math.min(n - 1, Math.max(0, st.focusIdx + delta));
    if (idx === st.focusIdx) return;
    this.focusTo(idx);
    const input = this.inputAt(idx);
    if (input) { input.focus(); input.scrollIntoView({ block: "nearest" }); }
  }

  protected focusTo(idx: number): void {
    const st = this.getState();
    if (idx === st.focusIdx) return;
    this.setState({ focusIdx: idx });
    const entry = this.getState().entries[idx];
    if (entry) this.deps.onFocusRow?.(entry.sysId);
  }

  protected inputAt(idx: number): HTMLElement | null {
    const right = this.q<HTMLElement>(".ce-right");
    const row = right.querySelector<HTMLElement>(`.ce-row[data-idx="${idx}"]`);
    return row ? row.querySelector<HTMLElement>(".ce-input") : null;
  }

  show(opts: { colKey: string; colLabel: string; cls: string; entries: ColumnEntry[]; focusIdx: number }): void {
    this.setState({
      open: true,
      colKey: opts.colKey,
      colLabel: opts.colLabel,
      cls: opts.cls,
      entries: opts.entries,
      focusIdx: Math.max(0, opts.focusIdx),
      dirtyCount: 0,
      filter: ""
    });
    const input = this.inputAt(this.getState().focusIdx);
    if (input) input.focus();
  }

  close(): void {
    if (!this.getState().open) return;
    this.setState({ open: false, entries: [] });
    this.deps.onClosed?.();
  }

  isOpen(): boolean {
    return this.getState().open;
  }

  /** Rebuild the right list + left pane (e.g. after Calclens toggled while open). */
  refresh(): void {
    if (this.getState().open) this.patch(this.getState());
  }
}
