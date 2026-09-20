import { el } from "../common/components/component.ts";
import type { ResolvedItem } from "./overrides.ts";
import type { SctaskRow } from "../services/sctask-bulk-service.ts";

export type ConfirmModalDeps = {
  root: HTMLElement;
  intro: HTMLElement;
  list: HTMLElement;
  summary: HTMLElement;
  postBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  doneBtn: HTMLButtonElement;
  retryBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
};

export type ConfirmModalEvents = {
  /** User confirmed the post. Given the items to write. */
  onPost?: (items: ResolvedItem[]) => void;
  /** User asked to retry only the failed items. */
  onRetry?: (items: ResolvedItem[]) => void;
  /** User clicked a ticket number in the preview to edit its text. */
  onEditItem?: (sysId: string) => void;
};

/**
 * The preview → confirm → progress → summary dialog for the bulk write.
 *
 * Shows the RESOLVED per-ticket text (shared vs override already applied), then
 * — once posting starts — flips each row from pending to ok/failed as progress
 * arrives, and finally shows a summary with a "Retry failed" affordance. Pure
 * DOM so it is unit-testable; the page owns the bridge calls and passes results
 * in via `markRow`/`finish`.
 */
export class ConfirmModal {
  private readonly d: ConfirmModalDeps;
  private readonly events: ConfirmModalEvents;
  private items: ResolvedItem[] = [];
  private numberBySysId = new Map<string, string>();
  private readonly rowEls = new Map<string, HTMLElement>();
  private phase: "confirm" | "posting" | "retry" | "done" = "confirm";

  constructor(deps: ConfirmModalDeps, events: ConfirmModalEvents = {}) {
    this.d = deps;
    this.events = events;
    this.d.postBtn.addEventListener("click", () => this.events.onPost?.(this.items));
    this.d.retryBtn.addEventListener("click", () => {
      const failed = this.items.filter((i) => this.#status(i.sysId) === "failed");
      this.events.onRetry?.(failed);
    });
    this.d.cancelBtn.addEventListener("click", () => this.close());
    this.d.closeBtn.addEventListener("click", () => this.close());
    this.d.doneBtn.addEventListener("click", () => this.close());
  }

  /** Opens the dialog in confirm state for the given resolved items. */
  open(items: ResolvedItem[], rows: SctaskRow[]): void {
    this.items = items.map((i) => ({ ...i }));
    this.numberBySysId = new Map(rows.map((r) => [r.sysId, r.number]));
    this.rowEls.clear();
    this.d.intro.textContent = `You are about to post to ${items.length} SCTASK${
      items.length === 1 ? "" : "s"
    }. This cannot be undone.`;
    this.d.list.replaceChildren(...items.map((i) => this.#renderItem(i)));
    this.d.summary.classList.add("hidden");
    this.d.summary.textContent = "";
    this.#setPhase("confirm");
    this.d.root.classList.remove("hidden");
  }

  close(): void {
    this.d.root.classList.add("hidden");
  }

  isOpen(): boolean {
    return !this.d.root.classList.contains("hidden");
  }

  /** Switches to the posting phase (disables inputs, shows pending rows). */
  startPosting(): void {
    this.#setPhase("posting");
    for (const item of this.items) this.#setStatus(item.sysId, "pending");
  }

  /** Flips a single row to ok/failed as progress arrives. */
  markRow(sysId: string, ok: boolean, error?: string): void {
    this.#setStatus(sysId, ok ? "ok" : "failed", error);
  }

  /** Shows the final summary and the Done / Retry-failed controls. */
  finish(succeeded: number, failed: number): void {
    this.d.summary.textContent = `${succeeded} succeeded \u00b7 ${failed} failed`;
    this.d.summary.classList.remove("hidden");
    this.#setPhase(failed > 0 ? "retry" : "done");
  }

  #renderItem(item: ResolvedItem): HTMLElement {
    const wrap = el("div", "confirmRow py-1.5 border-b border-line/40");
    wrap.dataset.sysId = item.sysId;
    const number = this.numberBySysId.get(item.sysId) || item.sysId;
    const head = el("div", "flex items-center gap-2");
    head.appendChild(el("span", "statusDot text-dim", "\u2022"));
    // The number is clickable (only while confirming) to edit this ticket's text.
    const numEl = el("a", "font-semibold linklike numberLink", number) as HTMLAnchorElement;
    numEl.setAttribute("role", "button");
    numEl.title = "Edit this ticket's text";
    numEl.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (this.phase === "confirm") this.events.onEditItem?.(item.sysId);
    });
    head.appendChild(numEl);
    wrap.appendChild(head);
    this.#renderBody(wrap, item);
    this.rowEls.set(item.sysId, wrap);
    return wrap;
  }

  /** (Re)draws the comment/work-note preview lines for a row. */
  #renderBody(wrap: HTMLElement, item: ResolvedItem): void {
    wrap.querySelectorAll(".confirmText").forEach((n) => n.remove());
    if (item.comments) {
      wrap.appendChild(el("div", "confirmText text-dim", `Comment: ${item.comments}`));
    }
    if (item.workNotes) {
      wrap.appendChild(el("div", "confirmText text-dim", `Work note: ${item.workNotes}`));
    }
  }

  /**
   * Replaces a preview item's resolved text and re-renders its row in place.
   * Used when the user edits a ticket from the preview. Only meaningful in the
   * confirm phase (before posting starts).
   */
  updateItem(item: ResolvedItem): void {
    const idx = this.items.findIndex((i) => i.sysId === item.sysId);
    if (idx === -1) return;
    this.items[idx] = item;
    const row = this.rowEls.get(item.sysId);
    if (row) this.#renderBody(row, item);
  }

  #setStatus(sysId: string, status: string, error?: string): void {
    const row = this.rowEls.get(sysId);
    if (!row) return;
    row.dataset.status = status;
    const dot = row.querySelector(".statusDot") as HTMLElement | null;
    if (dot) {
      dot.textContent =
        status === "ok"
          ? "\u2714"
          : status === "failed"
            ? "\u2717"
            : status === "pending"
              ? "\u2026"
              : "\u2022";
      dot.className = `statusDot ${
        status === "ok" ? "text-good" : status === "failed" ? "text-bad" : "text-dim"
      }`;
    }
    let note = row.querySelector(".statusNote") as HTMLElement | null;
    if (status === "failed" && error) {
      if (!note) {
        note = el("div", "statusNote text-bad text-[11px]");
        row.appendChild(note);
      }
      note.textContent = `Failed: ${error}`;
    } else if (note) {
      note.remove();
    }
  }

  #status(sysId: string): string {
    return this.rowEls.get(sysId)?.dataset.status || "";
  }

  #setPhase(phase: "confirm" | "posting" | "retry" | "done"): void {
    this.phase = phase;
    const showPost = phase === "confirm";
    const showPosting = phase === "posting";
    const showEnd = phase === "retry" || phase === "done";
    this.d.postBtn.classList.toggle("hidden", !showPost);
    this.d.cancelBtn.classList.toggle("hidden", showEnd || showPosting);
    this.d.postBtn.disabled = showPosting;
    this.d.doneBtn.classList.toggle("hidden", !showEnd);
    this.d.retryBtn.classList.toggle("hidden", phase !== "retry");
  }
}
