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
import type { SctaskScope } from "../services/sctask-bulk-service.ts";

/*
 * Composition root for the Bulk SCTASK Update page.
 *
 * The only place that knows both the concrete repositories and the DOM. Loads
 * the configured instance URL from settings, lists SCTASKs via the bridge, and
 * wires selection, the shared comment/work-note inputs, the per-ticket override
 * popup, and the copy-last-work-note helper. The confirm/write modal lands in a
 * later task; the resolution rule (shared vs override) lives in overrides.ts.
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
  const commentsBox = $("comments") as HTMLTextAreaElement;
  const workNotesBox = $("workNotes") as HTMLTextAreaElement;
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
    // Pull last work notes applies to every selected ticket.
    copyLastBtn.disabled = selected.length === 0;
    // Postable if something is selected and there is shared text OR at least one
    // selected ticket carries an override.
    const hasShared = !!(commentsBox.value.trim() || workNotesBox.value.trim());
    const hasOverride = selected.some((id) => overrides.has(id));
    updateBtn.disabled = selected.length === 0 || (!hasShared && !hasOverride);
  }

  /** Pushes the current override text into the list's Comments/Work notes columns. */
  function syncOverrides(): void {
    const map = new Map<string, { comments: string; workNotes: string }>();
    for (const id of overrides.keys()) {
      const ov = overrides.get(id);
      map.set(id, { comments: ov?.comments ?? "", workNotes: ov?.workNotes ?? "" });
    }
    view.setOverrideText(map);
  }

  const view = new SctaskListView(
    {
      table: $("sctaskTable") as HTMLTableElement,
      status: $("listStatus")
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

  function openConfirm(): void {
    const items = resolveItems(
      view.getSelected(),
      { comments: commentsBox.value, workNotes: workNotesBox.value },
      overrides
    );
    if (!items.length) {
      showToast("Nothing to post — select tickets and enter a comment or work note.", "info");
      return;
    }
    confirm.open(items, view.getRows());
  }

  const loaded = await settings.load();
  const instanceUrl = String(loaded?.instanceUrl ?? "").trim();
  connState.textContent = instanceUrl || "No instance configured";

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
      view.render(reply.rows || []);
    } catch (err) {
      view.setStatus(`Failed to load SCTASKs: ${(err as Error).message}`);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  async function pullLastWorkNotes(): Promise<void> {
    const selected = view.getSelected();
    if (!selected.length || !instanceUrl) return;
    copyLastBtn.disabled = true;
    const original = copyLastBtn.textContent;
    copyLastBtn.textContent = "Pulling…";
    try {
      for (const sysId of selected) {
        try {
          const reply = await bridge.copyLastWorkNote({ instanceUrl, sysId });
          if (reply.ok && reply.workNote) {
            const existing = overrides.get(sysId);
            overrides.set(sysId, {
              comments: existing?.comments ?? "",
              workNotes: reply.workNote
            });
          }
        } catch {
          /* skip a ticket that fails; continue with the rest */
        }
      }
      syncOverrides();
    } finally {
      copyLastBtn.textContent = original;
      refreshControls();
    }
  }

  async function flagMissingWorkNotes(): Promise<void> {
    const sysIds = view.getRows().map((r) => r.sysId);
    if (!sysIds.length || !instanceUrl) return;
    flagBtn.disabled = true;
    const original = flagBtn.textContent;
    flagBtn.textContent = "Checking…";
    try {
      const reply = await bridge.checkWorkNotes({ instanceUrl, sysIds });
      if (reply.ok) {
        const missing = reply.missing || [];
        view.setFlagged(missing);
        selectFlaggedBtn.disabled = missing.length === 0;
      }
    } finally {
      flagBtn.disabled = false;
      flagBtn.textContent = original;
    }
  }

  function selectFlagged(): void {
    // "Add to" (union) the current selection, per the agreed behavior.
    view.selectSysIds(view.getFlagged());
    refreshControls();
  }

  scopeSel.addEventListener("change", load);
  refreshBtn.addEventListener("click", load);
  searchInput.addEventListener("input", () => view.setFilter(searchInput.value));
  commentsBox.addEventListener("input", refreshControls);
  workNotesBox.addEventListener("input", refreshControls);
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
