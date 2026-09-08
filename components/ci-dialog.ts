import { Component, el } from "./component.ts";
import type { ComponentProps } from "./component.ts";
import { setTip } from "../lib/tooltip.ts";
import { icon, iconButton } from "../lib/icons.ts";

export type CiGroup = {
  name: string;
  items: string[];
};

export type CiSplitValue = {
  enabled: boolean;
  groups: CiGroup[];
};

export type CiDialogState = {
  enabled: boolean;
  groups: CiGroup[];
  available: string[];
};

export type CiDialogDeps = {
  onSave: (value: CiSplitValue) => Promise<void> | void;
  onClosed: () => void;
  status: (message: string, isError?: boolean) => void;
};

export type CiDialogRefs = {
  enabled: HTMLInputElement;
  board: HTMLElement;
  save: HTMLElement;
  close: HTMLElement;
  addGroup: HTMLElement;
};

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

/** Configuration items present in the data but not yet in any group, deduped
 *  case-insensitively and sorted. Pure. */
export function unassignedItems(available: string[], groups: { items: string[] }[]): string[] {
  const grouped = new Set<string>();
  for (const g of groups) for (const it of g.items) grouped.add(norm(it));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of available) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const k = norm(text);
    if (grouped.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(text);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * The "separate files per configuration item" editor.
 *
 * Edits a draft copy and only commits on Save. An Ungrouped pool lists the
 * configuration items found in the pulled data that are not yet in a group;
 * it is derived on render and never persisted. Drag chips between groups and
 * the pool; click chips to select several and drag them together.
 */
export class CiDialog extends Component<CiDialogState, ComponentProps, CiDialogDeps> {
  protected declare refs: CiDialogRefs;

  /** Transient drag source. gi === -1 means the Ungrouped pool. */
  #dragSrc: { gi: number; item: string } | null = null;
  /** Transient multi-selection, keyed by normalised item. */
  #selected = new Set<string>();

  protected initialState(): CiDialogState {
    return { enabled: false, groups: [], available: [] };
  }

  protected build(): void {
    this.refs.enabled = this.q<HTMLInputElement>("#ciEnabled");
    this.refs.board = this.q("#groupBoard");
    this.refs.save = this.q("#ciSave");
    this.refs.close = this.q("#ciClose");
    this.refs.addGroup = this.q("#addGroupBtn");

    this.refs.addGroup.addEventListener("click", () => {
      this.setState({ groups: [...this.getState().groups, { name: this.nextGroupName(), items: [] }] });
    });

    this.refs.save.addEventListener("click", () => {
      void this.commit();
    });
  }

  protected patch(next: CiDialogState, prev: CiDialogState | null): void {
    if (!prev || next.enabled !== prev.enabled) this.refs.enabled.checked = next.enabled;
    if (!prev || next.groups !== prev.groups || next.available !== prev.available) this.renderBoard(next);
  }

  /** Opens on a fresh draft copied from the stored value plus the CI universe. */
  show(value: CiSplitValue, availableItems: string[] = []): void {
    this.#selected.clear();
    const groups = value.groups.map((g) => ({ name: g.name, items: [...g.items] }));
    if (value.enabled && !groups.length) groups.push({ name: "Group A", items: [] });
    this.setState({ enabled: value.enabled, groups, available: [...availableItems] });
  }

  protected async commit(): Promise<void> {
    const enabled = this.refs.enabled.checked;
    const groups = this.normalisedGroups();

    if (enabled && !groups.length) {
      this.deps.status("Add at least one group or turn the split off", true);
      return;
    }
    if (enabled && !groups.some((g) => g.items.length)) {
      this.deps.status("Add at least one configuration item or turn the split off", true);
      return;
    }

    try {
      await this.deps.onSave({ enabled, groups });
    } catch (err) {
      this.deps.status(`Save failed: ${(err as Error).message}`, true);
      return;
    }

    this.deps.status(
      enabled
        ? `Split enabled — one file per group (${groups.length} groups)`
        : "Split disabled — exports stay a single file"
    );
    this.deps.onClosed();
  }

  /** Trims names, drops empty groups, and de-duplicates names case-insensitively. */
  protected normalisedGroups(): CiGroup[] {
    const seen = new Set<string>();
    return this.getState()
      .groups.map((g) => ({ name: String(g.name ?? "").trim(), items: [...g.items] }))
      .filter((g) => g.items.length || g.name)
      .map((g, i) => {
        if (!g.name) g.name = `Group ${i + 1}`;
        let name = g.name;
        let k = 2;
        while (seen.has(name.toLowerCase())) name = `${g.name} ${k++}`;
        seen.add(name.toLowerCase());
        return { name, items: g.items };
      });
  }

  protected nextGroupName(): string {
    const used = new Set(this.getState().groups.map((g) => g.name.toLowerCase()));
    for (let i = 0; i < 26; i++) {
      const name = `Group ${String.fromCharCode(65 + i)}`;
      if (!used.has(name.toLowerCase())) return name;
    }
    return `Group ${this.getState().groups.length + 1}`;
  }

  protected renderBoard(state: CiDialogState): void {
    const board = this.refs.board;
    board.innerHTML = "";
    board.appendChild(this.renderUngrouped(state));
    const grid = el("div", "ciGroupGrid");
    state.groups.forEach((group, gi) => grid.appendChild(this.renderGroup(group, gi)));
    board.appendChild(grid);
  }

  protected renderUngrouped(state: CiDialogState): HTMLElement {
    const items = unassignedItems(state.available, state.groups);
    const card = el("div", "ciGroupCard ciUngrouped");

    const head = el("div", "ciGroupHead");
    const title = el("span", "ciUngroupedTitle");
    title.append(icon("list", "ciHeadIcon"), document.createTextNode(` Ungrouped (${items.length})`));
    head.append(title);

    const list = el("div", "ciItems");
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("dragOver");
    });
    list.addEventListener("dragleave", () => list.classList.remove("dragOver"));
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("dragOver");
      this.dropOnUngrouped();
    });

    if (!items.length) {
      list.appendChild(el("div", "ciEmptyHint", "All configuration items are grouped"));
    }
    for (const item of items) list.appendChild(this.renderChip(item, -1, false));

    card.append(head, list);
    return card;
  }

  protected renderGroup(group: CiGroup, gi: number): HTMLElement {
    const card = el("div", "ciGroupCard");

    const head = el("div", "ciGroupHead");
    const nameIn = el("input", "ciGroupName") as HTMLInputElement;
    nameIn.value = group.name;
    nameIn.placeholder = `Group ${gi + 1}`;
    nameIn.addEventListener("change", () => {
      const trimmed = nameIn.value.trim();
      if (!trimmed) {
        nameIn.value = group.name;
        return;
      }
      group.name = trimmed;
    });

    const del = iconButton("trash-2", "Delete this group", { cls: "ciDelGroup" });
    del.addEventListener("click", () => {
      this.setState({ groups: this.getState().groups.filter((_, i) => i !== gi) });
    });
    head.append(nameIn, del);

    const list = el("div", "ciItems");
    list.dataset.gi = String(gi);
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("dragOver");
    });
    list.addEventListener("dragleave", () => list.classList.remove("dragOver"));
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("dragOver");
      this.dropOnGroup(gi);
    });

    group.items.forEach((item) => list.appendChild(this.renderChip(item, gi, true)));

    const addRow = el("div", "ciAddRow");
    const input = el("input") as HTMLInputElement;
    input.placeholder = "Add configuration item";
    const addBtn = iconButton("plus", "Add to this group", { cls: "ciAddBtn" });
    addBtn.addEventListener("click", () => this.commitInput(input, gi));
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key !== "Enter") return;
      e.preventDefault();
      this.commitInput(input, gi);
    });
    input.addEventListener("paste", (e) => {
      const text = (e as ClipboardEvent).clipboardData?.getData("text") || "";
      if (!text || !/[\n,;]/.test(text)) return;
      e.preventDefault();
      this.addMany(gi, text);
    });
    addRow.append(input, addBtn);

    card.append(head, list, addRow);
    return card;
  }

  protected renderChip(item: string, gi: number, removable: boolean): HTMLElement {
    const chip = el("div", "ciChip");
    (chip as HTMLElement & { draggable: boolean }).draggable = true;
    if (this.#selected.has(norm(item))) chip.classList.add("selected");
    setTip(chip, "Click to select · drag to another group");

    const label = el("span", "lbl", item);
    chip.appendChild(label);

    if (removable) {
      const remove = iconButton("x-circle", "Remove this configuration item", { cls: "rm" });
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        const groups = this.getState().groups;
        const g = groups[gi];
        if (g) g.items = g.items.filter((x) => norm(x) !== norm(item));
        this.setState({ groups: [...groups] });
      });
      chip.appendChild(remove);
    }

    chip.addEventListener("click", () => {
      const k = norm(item);
      if (this.#selected.has(k)) this.#selected.delete(k);
      else this.#selected.add(k);
      chip.classList.toggle("selected", this.#selected.has(k));
    });

    chip.addEventListener("dragstart", () => {
      this.#dragSrc = { gi, item };
    });

    return chip;
  }

  /** The set of items to move for a drag: the whole selection if the dragged
   *  chip is selected, else just the dragged item (and the selection resets). */
  protected movingItems(): string[] {
    const src = this.#dragSrc;
    if (!src) return [];
    if (this.#selected.has(norm(src.item)) && this.#selected.size) {
      const keys = this.#selected;
      const all = new Map<string, string>();
      for (const g of this.getState().groups) for (const it of g.items) all.set(norm(it), it);
      for (const it of unassignedItems(this.getState().available, this.getState().groups)) all.set(norm(it), it);
      return [...keys].map((k) => all.get(k) || k);
    }
    return [src.item];
  }

  protected dropOnGroup(targetGi: number): void {
    const items = this.movingItems();
    if (!items.length) return;
    const groups = this.getState().groups;
    const to = groups[targetGi];
    if (!to) return;
    for (const item of items) {
      for (const g of groups) g.items = g.items.filter((x) => norm(x) !== norm(item));
      if (!to.items.some((x) => norm(x) === norm(item))) to.items.push(item);
    }
    this.finishDrag(groups);
  }

  protected dropOnUngrouped(): void {
    const items = this.movingItems();
    if (!items.length) return;
    const groups = this.getState().groups;
    for (const item of items) {
      for (const g of groups) g.items = g.items.filter((x) => norm(x) !== norm(item));
    }
    this.finishDrag(groups);
  }

  protected finishDrag(groups: CiGroup[]): void {
    this.#dragSrc = null;
    this.#selected.clear();
    this.setState({ groups: [...groups] });
  }

  /** Adds one item unless it is blank or already present, case-insensitively. */
  protected addUnique(gi: number, raw: string): boolean {
    const text = String(raw ?? "").trim();
    if (!text) return false;
    const group = this.getState().groups[gi];
    if (!group) return false;
    if (group.items.some((x) => x.toLowerCase() === text.toLowerCase())) return false;
    group.items.push(text);
    return true;
  }

  protected commitInput(input: HTMLInputElement, gi: number): void {
    const added = this.addMany(gi, input.value);
    input.value = "";
    if (added) this.refreshAndFocus(gi);
  }

  protected addMany(gi: number, raw: string): number {
    let added = 0;
    for (const part of raw.split(/[\n,;]+/)) {
      if (this.addUnique(gi, part)) added++;
    }
    return added;
  }

  protected refreshAndFocus(gi: number): void {
    this.setState({ groups: [...this.getState().groups] });
    const input = this.refs.board
      .querySelectorAll(".ciGroupGrid .ciGroupCard")
      [gi]?.querySelector(".ciAddRow input") as HTMLInputElement | undefined;
    input?.focus();
  }
}
