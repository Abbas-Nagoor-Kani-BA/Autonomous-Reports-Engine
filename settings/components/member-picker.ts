import { Modal } from "../../common/components/modal.ts";
import type { ModalState, ModalDeps } from "../../common/components/modal.ts";
import { el } from "../../common/components/component.ts";
import type { ComponentProps } from "../../common/components/component.ts";

export type MemberPickerState = ModalState & {
  title: string;
  heading: string;
  members: string[];
  checked: boolean[];
  truncated: boolean;
};

export type MemberPickerRefs = {
  titleEl?: HTMLElement;
  notice?: HTMLElement;
  list?: HTMLElement;
  addBtn?: HTMLButtonElement;
  cancelBtn?: HTMLButtonElement;
  allBtn?: HTMLButtonElement;
  noneBtn?: HTMLButtonElement;
  countEl?: HTMLElement;
};

/**
 * Per-queue member confirmation dialog.
 *
 * Shows the active members resolved for one group as a checkbox list (all
 * checked by default) so the user picks which to add to the Team members list.
 * A truncation notice appears when the group exceeded the single-page read.
 * `openFor` seeds the list and registers the confirm callback; Add returns only
 * the checked names.
 */
export class MemberPicker extends Modal {
  protected declare refs: MemberPickerRefs;
  #onConfirm: ((names: string[]) => void) | null = null;

  protected override initialState(): MemberPickerState {
    return { open: false, title: "", heading: "", members: [], checked: [], truncated: false };
  }

  protected override build(): void {
    super.build();
    this.root.className = "hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";

    const box = el("div", "bg-card border border-line rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]");

    const head = el("div", "px-4 py-3 border-b border-line");
    this.refs.titleEl = el("h2", "text-sm font-semibold text-text", "Resolve members");
    head.appendChild(this.refs.titleEl);

    this.refs.notice = el("div", "memberNotice hidden px-4 pt-2 text-[11.5px] text-warn");

    const toolbar = el("div", "flex items-center justify-between gap-2 px-4 pt-2");
    this.refs.countEl = el("span", "memberCount text-dim text-[11px]");
    const toolBtns = el("div", "flex gap-2");
    this.refs.allBtn = el("button", "btn py-0.5 px-2 text-[11px]", "Select all");
    this.refs.allBtn.type = "button";
    this.refs.noneBtn = el("button", "btn py-0.5 px-2 text-[11px]", "Select none");
    this.refs.noneBtn.type = "button";
    toolBtns.append(this.refs.allBtn, this.refs.noneBtn);
    toolbar.append(this.refs.countEl, toolBtns);

    this.refs.list = el("div", "memberList flex flex-col gap-1 overflow-y-auto px-4 py-2 min-h-0");

    const actions = el("div", "flex justify-end gap-2 px-4 py-3 border-t border-line");
    this.refs.cancelBtn = el("button", "btn py-1.5 px-3 text-xs", "Cancel");
    this.refs.cancelBtn.type = "button";
    this.refs.addBtn = el("button", "primary btn-primary py-1.5 px-3 text-xs", "Add selected");
    this.refs.addBtn.type = "button";
    actions.append(this.refs.cancelBtn, this.refs.addBtn);

    box.append(head, this.refs.notice, toolbar, this.refs.list, actions);
    this.root.appendChild(box);

    this.refs.allBtn.addEventListener("click", () => this.setAll(true));
    this.refs.noneBtn.addEventListener("click", () => this.setAll(false));
    this.refs.cancelBtn.addEventListener("click", () => this.close());
    this.refs.addBtn.addEventListener("click", () => this.confirm());
  }

  protected setAll(value: boolean): void {
    const state = this.getState() as MemberPickerState;
    this.setState({ checked: state.members.map(() => value) } as Partial<MemberPickerState>);
  }

  protected toggleAt(index: number, value: boolean): void {
    const checked = (this.getState() as MemberPickerState).checked.slice();
    checked[index] = value;
    this.setState({ checked } as Partial<MemberPickerState>);
  }

  protected confirm(): void {
    const state = this.getState() as MemberPickerState;
    const names = state.members.filter((_, i) => state.checked[i]);
    const cb = this.#onConfirm;
    this.close();
    cb?.(names);
  }

  protected override patch(next: MemberPickerState, prev: MemberPickerState | null): void {
    super.patch(next, prev);
    const { titleEl, notice, list, countEl } = this.refs;
    if (!titleEl || !notice || !list || !countEl) return;

    titleEl.textContent = next.heading || (next.title ? `Members of "${next.title}"` : "Resolve members");

    notice.hidden = !next.truncated;
    if (next.truncated) {
      notice.textContent = `Showing the first ${next.members.length} members — this group is large and the list may be truncated.`;
    }

    const selected = next.checked.filter(Boolean).length;
    countEl.textContent = next.members.length
      ? `${selected} of ${next.members.length} selected`
      : "No active members found";

    list.innerHTML = "";
    next.members.forEach((name, i) => {
      const rowId = `mp-${i}`;
      const row = el("label", "memberRow flex items-center gap-2 text-[12.5px] text-text cursor-pointer");
      const cb = el("input", "memberCheckbox") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = !!next.checked[i];
      cb.id = rowId;
      cb.addEventListener("change", () => this.toggleAt(i, cb.checked));
      const span = el("span", "memberName break-words min-w-0", name);
      row.append(cb, span);
      list.appendChild(row);
    });
  }

  /** Seeds the dialog for a group and opens it. An explicit `title` overrides
   *  the default `Members of "group"` heading (e.g. for configuration items). */
  openFor(opts: { group: string; members: string[]; truncated?: boolean; title?: string; onConfirm: (names: string[]) => void }): void {
    this.#onConfirm = opts.onConfirm;
    this.setState({
      title: opts.group,
      heading: opts.title ?? "",
      members: opts.members.slice(),
      checked: opts.members.map(() => true),
      truncated: !!opts.truncated,
      open: true
    } as Partial<MemberPickerState>);
  }
}

export type { ModalDeps as MemberPickerDeps, ComponentProps as MemberPickerProps };
