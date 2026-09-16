import { STORAGE } from "../lib/keys.ts";
import { normalizeNames } from "../core/summary/names.ts";

/*
 * Shared accessor for the Configuration items resolved in Settings
 * (`pluginSettings.defaults.configItems`).
 *
 * Owned here so both the CI split dialog (viewer/dialogs.ts) and the bulk column
 * editor's CI autocomplete (viewer/column-editor.ts) read one cached list. The
 * value is loaded once on init and can be refreshed; reads are synchronous so
 * the dialog/editor open paths stay simple.
 */

let storedConfigItems: string[] = [];

/** Reloads the stored configuration items from settings (fire-and-forget). */
export function refreshStoredConfigItems(): void {
  chrome.storage.local
    .get(STORAGE.pluginSettings)
    .then((res: Record<string, unknown>) => {
      const defaults = (res?.[STORAGE.pluginSettings] as { defaults?: { configItems?: unknown } })?.defaults;
      storedConfigItems = normalizeNames(Array.isArray(defaults?.configItems) ? defaults?.configItems : []);
    })
    .catch(() => {
      storedConfigItems = [];
    });
}

/** The last-loaded stored configuration items. */
export function getStoredConfigItems(): string[] {
  return storedConfigItems;
}
