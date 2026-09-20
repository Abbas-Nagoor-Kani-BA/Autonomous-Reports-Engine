import { Container } from "../di/container.ts";
import { registerCoreRepositories } from "../di/register-core.ts";
import { SETTINGS_REPO, REMOTE_BRIDGE } from "../di/tokens.ts";
import { RemoteBridge } from "../common/services/remote-bridge.ts";
import { SctaskListView } from "./list-view.ts";
import { OverrideStore, resolveItems } from "./overrides.ts";
import type { ResolvedItem } from "./overrides.ts";
import { ConfirmModal } from "./confirm-modal.ts";
import { showToast } from "../lib/toast.ts";
import { initTooltips } from "../lib/tooltip.ts";
import type { SctaskScope, SctaskRow } from "../services/sctask-bulk-service.ts";

/*
 * Composition root for the Bulk SCTASK Update page.
 *
 * The only place that knows both the concrete repositories and the DOM. Loads
 * the configured instance URL from settings, lists SCTASKs (the list call also
 * returns each row's work_notes, so the newest note + "has a note" are known
 * up front with NO per-ticket reads). All comment/work-note text is per-ticket,
 * entered via the row popup and shown in the Comments/Work notes columns; there
 * is no shared box. The write posts each ticket's own text.
 */

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`sctask: missing #${id}`);
  return node;
}

export async function bootSctaskPage(): Promise<void> {
  const container = registerCoreRepositories(new Container());
  container.registerClass(REMOTE_BRIDGE, RemoteBridge, { singleton: true });
  const bridge = container.resolve<RemoteBridge>(REMOTE_BRIDGE);
  const settings = container.resolve(SETTINGS_REPO);

  const scopeSel = $("scope") as HTMLSelectElement;
  const refreshBtn = $("refreshBtn") as HTMLButtonElement;
  const searchInput = $("search") as HTMLInputElement;
  const selCount = $("selCount");
  const connState = $("connState");
  const copyLastBtn = $("copyLastBtn") as HTMLButtonElement;
  const updateBtn = $("updateBtn") as HTMLButtonElement;
  const flagBtn = $("flagBtn") as HTMLButtonElement;
  const selectFlaggedBtn = $("selectFlaggedBtn") as HTMLButtonElement;

  // Override popup elements.
  const overrideModal = $("overrideModal");
  const overrideTitle = $("overrideTitle");
  const ovComments = $("ovComments") as HTMLTextAreaElement;
  const ovWorkNotes = $("ovWorkNotes") as HTMLTextAreaElement;

  const overrides = new OverrideStore();
  let editingSysId: string | null = null;

  /** Enable/disable the action buttons from the current selection + inputs. */
  function refreshControls(): void {
    const selected = view.getSelected();
    // Pull last work notes + Preview & Update apply to the selected tickets.
    copyLastBtn.disabled = selected.length === 0;
    updateBtn.disabled = selected.length === 0;
  }

  /** Pushes the current per-ticket text into the Comments/Work notes columns. */
  function syncOverrides(): void {
    const map = new Map<string, { comments: string; workNotes: string }>();
    for (const id of overrides.keys()) {
      const ov = overrides.get(id);
      map.set(id, { comments: ov?.comments ?? "", workNotes: ov?.workNotes ?? "" });
    }
    view.setOverrideText(map);
  }

  const loaded = await settings.load();
  const instanceUrl = String(loaded?.instanceUrl ?? "").trim();
  connState.textContent = instanceUrl || "No instance configured";

  const view = new SctaskListView(
    {
      table: $("sctaskTable") as HTMLTableElement,
      status: $("listStatus"),
      instanceUrl
    },
    {
      selectionChange: ({ selected, total }) => {
        selCount.textContent = total ? `${selected} of ${total} selected` : "";
        refreshControls();
      },
      onEdit: (sysId) => openOverride(sysId)
    }
  );

  function openOverride(sysId: string): void {
    editingSysId = sysId;
    const row = view.getRows().find((r) => r.sysId === sysId);
    overrideTitle.textContent = `Edit ${row?.number ?? "SCTASK"}`;
    const ov = overrides.get(sysId);
    ovComments.value = ov?.comments ?? "";
    ovWorkNotes.value = ov?.workNotes ?? "";
    overrideModal.classList.remove("hidden");
  }

  function closeOverride(): void {
    editingSysId = null;
    overrideModal.classList.add("hidden");
  }

  function saveOverride(): void {
    if (editingSysId) {
      overrides.set(editingSysId, { comments: ovComments.value, workNotes: ovWorkNotes.value });
      syncOverrides();
      refreshControls();
    }
    closeOverride();
  }

  function clearOverride(): void {
    if (editingSysId) {
      overrides.clear(editingSysId);
      syncOverrides();
      refreshControls();
    }
    closeOverride();
  }

  $("overrideSave").addEventListener("click", saveOverride);
  $("overrideClear").addEventListener("click", clearOverride);
  $("overrideCancel").addEventListener("click", closeOverride);
  $("overrideClose").addEventListener("click", closeOverride);

  // Confirm/progress/summary modal.
  const confirm = new ConfirmModal(
    {
      root: $("confirmModal"),
      intro: $("confirmIntro"),
      list: $("confirmList"),
      summary: $("confirmSummary"),
      postBtn: $("confirmPost") as HTMLButtonElement,
      cancelBtn: $("confirmCancel") as HTMLButtonElement,
      doneBtn: $("confirmDone") as HTMLButtonElement,
      retryBtn: $("retryFailedBtn") as HTMLButtonElement,
      closeBtn: $("confirmClose") as HTMLButtonElement
    },
    {
      onPost: (items) => void postItems(items),
      onRetry: (items) => void postItems(items)
    }
  );

  /** Streams a bulk write, flipping per-row status live via onProgress. */
  async function postItems(items: ResolvedItem[]): Promise<void> {
    if (!items.length || !instanceUrl) return;
    confirm.startPosting();
    const off = bridge.onProgress((msg) => {
      if (msg.stage !== "sctaskRow") return;
      const r = msg as unknown as { detail: string; ok: boolean; error?: string };
      confirm.markRow(String(msg.detail ?? ""), !!r.ok, r.error);
    });
    try {
      const reply = await bridge.bulkUpdateSctasks({ instanceUrl, sysIds: [], items });
      const summary = reply.summary;
      const succeeded = summary?.succeeded ?? 0;
      const failed = summary?.failed ?? (reply.ok ? 0 : items.length);
      confirm.finish(succeeded, failed);
      showToast(
        `Bulk update: ${succeeded} succeeded, ${failed} failed`,
        failed ? "error" : "success"
      );
    } catch (err) {
      confirm.finish(0, items.length);
      showToast(`Bulk update failed: ${(err as Error).message}`, "error");
    } finally {
      off();
    }
  }

  /**
   * Opens the confirm modal for the selected tickets. All text is per-ticket
   * (no shared box), so resolveItems is called with an empty shared value and
   * only tickets that have their own text are postable. If some selected
   * tickets have NO text, warn and let the user proceed (posting only the ones
   * with text) or cancel.
   */
  function openConfirm(): void {
    const selected = view.getSelected();
    if (!selected.length) {
      showToast("Select at least one SCTASK.", "info");
      return;
    }
    const items = resolveItems(selected, { comments: "", workNotes: "" }, overrides);
    if (!items.length) {
      showToast(
        "None of the selected tickets have text — click a ticket's Comments or Work notes cell to add some.",
        "info"
      );
      return;
    }
    const withText = new Set(items.map((i) => i.sysId));
    const emptyCount = selected.filter((id) => !withText.has(id)).length;
    if (emptyCount > 0) {
      const ok = window.confirm(
        `${emptyCount} selected ticket(s) have no text and will be skipped. ` +
          `Post to the ${items.length} ticket(s) that do have text?`
      );
      if (!ok) return;
    }
    confirm.open(items, view.getRows());
  }

  async function load(): Promise<void> {
    if (!instanceUrl) {
      view.setStatus("No ServiceNow instance configured — set it in Settings first.");
      return;
    }
    view.setStatus("Loading…");
    refreshBtn.disabled = true;
    try {
      const scope = scopeSel.value as SctaskScope;
      const reply = await bridge.listSctasks({ instanceUrl, scope });
      if (!reply.ok) {
        view.setStatus(reply.error || "Failed to load SCTASKs.");
        return;
      }
      overrides.clearAll();
      view.render(reply.rows || []);
      selectFlaggedBtn.disabled = true;
    } catch (err) {
      view.setStatus(`Failed to load SCTASKs: ${(err as Error).message}`);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  /**
   * Fills each selected ticket's Work notes override from the last work note
   * ALREADY loaded with the list (row.lastWorkNote) — no extra API calls. A
   * ticket's existing comments override is preserved.
   */
  function pullLastWorkNotes(): void {
    const selected = new Set(view.getSelected());
    if (!selected.size) return;
    for (const row of view.getRows()) {
      if (!selected.has(row.sysId) || !row.lastWorkNote) continue;
      const existing = overrides.get(row.sysId);
      overrides.set(row.sysId, {
        comments: existing?.comments ?? "",
        workNotes: row.lastWorkNote
      });
    }
    syncOverrides();
    refreshControls();
  }

  /**
   * Flags tickets that have no work note, using the data loaded with the list
   * (row.hasWorkNote) — no extra API calls. Enables "Select flagged".
   */
  function flagMissingWorkNotes(): void {
    const missing = view
      .getRows()
      .filter((r: SctaskRow) => !r.hasWorkNote)
      .map((r) => r.sysId);
    view.setFlagged(missing);
    selectFlaggedBtn.disabled = missing.length === 0;
    showToast(
      missing.length
        ? `${missing.length} ticket(s) have no work note.`
        : "All listed tickets have a work note.",
      "info"
    );
  }

  function selectFlagged(): void {
    // "Add to" (union) the current selection, per the agreed behavior.
    view.selectSysIds(view.getFlagged());
    refreshControls();
  }

  scopeSel.addEventListener("change", load);
  refreshBtn.addEventListener("click", load);
  searchInput.addEventListener("input", () => view.setFilter(searchInput.value));
  copyLastBtn.addEventListener("click", pullLastWorkNotes);
  flagBtn.addEventListener("click", flagMissingWorkNotes);
  selectFlaggedBtn.addEventListener("click", selectFlagged);
  updateBtn.addEventListener("click", openConfirm);

  initTooltips();

  await load();
  refreshControls();
}

// Auto-boot in the browser; tests import bootSctaskPage / SctaskListView directly.
if (typeof document !== "undefined" && document.getElementById("sctaskTable")) {
  void bootSctaskPage();
}

export { SctaskListView };
