import { Container } from "../di/container.ts";
import { registerCoreRepositories } from "../di/register-core.ts";
import { SETTINGS_REPO, REMOTE_BRIDGE } from "../di/tokens.ts";
import { RemoteBridge } from "../common/services/remote-bridge.ts";
import { SctaskListView } from "./list-view.ts";
import { OverrideStore } from "./overrides.ts";
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
    // Copy last work note only makes sense for exactly one selected ticket.
    copyLastBtn.disabled = selected.length !== 1;
    // Postable if something is selected and there is shared text OR at least one
    // selected ticket carries an override.
    const hasShared = !!(commentsBox.value.trim() || workNotesBox.value.trim());
    const hasOverride = selected.some((id) => overrides.has(id));
    updateBtn.disabled = selected.length === 0 || (!hasShared && !hasOverride);
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
      view.setOverridden(overrides.keys());
      refreshControls();
    }
    closeOverride();
  }

  function clearOverride(): void {
    if (editingSysId) {
      overrides.clear(editingSysId);
      view.setOverridden(overrides.keys());
      refreshControls();
    }
    closeOverride();
  }

  $("overrideSave").addEventListener("click", saveOverride);
  $("overrideClear").addEventListener("click", clearOverride);
  $("overrideCancel").addEventListener("click", closeOverride);
  $("overrideClose").addEventListener("click", closeOverride);

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

  async function copyLastWorkNote(): Promise<void> {
    const selected = view.getSelected();
    if (selected.length !== 1 || !instanceUrl) return;
    copyLastBtn.disabled = true;
    try {
      const reply = await bridge.copyLastWorkNote({ instanceUrl, sysId: selected[0] });
      if (reply.ok) workNotesBox.value = reply.workNote || "";
    } finally {
      refreshControls();
    }
  }

  scopeSel.addEventListener("change", load);
  refreshBtn.addEventListener("click", load);
  searchInput.addEventListener("input", () => view.setFilter(searchInput.value));
  commentsBox.addEventListener("input", refreshControls);
  workNotesBox.addEventListener("input", refreshControls);
  copyLastBtn.addEventListener("click", copyLastWorkNote);

  await load();
  refreshControls();
}

// Auto-boot in the browser; tests import bootSctaskPage / SctaskListView directly.
if (typeof document !== "undefined" && document.getElementById("sctaskTable")) {
  void bootSctaskPage();
}

export { SctaskListView };
