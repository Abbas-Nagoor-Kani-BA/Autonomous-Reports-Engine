import { Container } from "../di/container.ts";
import { registerCoreRepositories } from "../di/register-core.ts";
import { SETTINGS_REPO, REMOTE_BRIDGE } from "../di/tokens.ts";
import { RemoteBridge } from "../common/services/remote-bridge.ts";
import { SctaskListView } from "./list-view.ts";
import type { SctaskScope } from "../services/sctask-bulk-service.ts";

/*
 * Composition root for the Bulk SCTASK Update page.
 *
 * Like the panel/settings roots, this is the only place that knows both the
 * concrete repositories and the DOM. It loads the configured instance URL from
 * settings, then wires the scope dropdown + refresh button to the bridge's
 * listSctasks call and renders the result. Selection, inputs, and the bulk
 * write layer on in later tasks.
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

  const view = new SctaskListView({
    table: $("sctaskTable") as HTMLTableElement,
    status: $("listStatus")
  });
  const scopeSel = $("scope") as HTMLSelectElement;
  const refreshBtn = $("refreshBtn") as HTMLButtonElement;
  const connState = $("connState");

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

  scopeSel.addEventListener("change", load);
  refreshBtn.addEventListener("click", load);
  await load();
}

// Auto-boot in the browser; tests import bootSctaskPage / SctaskListView directly.
if (typeof document !== "undefined" && document.getElementById("sctaskTable")) {
  void bootSctaskPage();
}

export { SctaskListView };
