import type { ViewerRow } from "./core.ts";

/**
 * Session-only "view one CI group" filter for the data grid.
 *
 * Transient (module-level, never persisted): selecting a group in the Split
 * preview scopes the grid to that group's rows for the current session. It
 * layers on top of the search filter in grid-data's currentRows(). Cleared on
 * reload and by the toolbar indicator's clear action.
 *
 * The grouping function is injected (like grid-data's display-value resolver)
 * so grid-data does not import the export service directly — that would form a
 * grid-data -> exporter -> grid -> grid-data import cycle.
 */
type Bucketer = (rows: ViewerRow[], group: string) => ViewerRow[];

let activeGroup: string | null = null;
let bucketer: Bucketer | null = null;

export function getActiveSplitGroup(): string | null {
  return activeGroup;
}

export function setActiveSplitGroup(name: string | null): void {
  activeGroup = name && name.trim() ? name : null;
}

export function setSplitBucketer(fn: Bucketer): void {
  bucketer = fn;
}

/** Restrict rows to the active group, or return them unchanged when no group
 *  is active or no bucketer has been injected yet. */
export function applySplitFilter(rows: ViewerRow[]): ViewerRow[] {
  if (!activeGroup || !bucketer) return rows;
  return bucketer(rows, activeGroup);
}
