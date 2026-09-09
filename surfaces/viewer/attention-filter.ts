/**
 * Attention filter — session-only "Flagged only" filter state.
 *
 * When active, currentRows() narrows the grid to rows that carry at least one
 * attention flag from a currently-enabled rule. "Currently-enabled" is defined
 * by isHighlightEnabled() from calclens-highlights.ts, so toggling a rule in
 * the Highlights menu immediately changes which rows the filter keeps.
 *
 * Like calclens-state.ts this is intentionally session-only: the flag always
 * starts false on page load and is never written to chrome.storage.local. The
 * filter clears automatically when the user reloads or closes the viewer.
 *
 * No DOM, no chrome.*, no I/O — pure state + pure filter function.
 */

import { computeAttention } from "../../core/attention.ts";
import type { ViewerRow } from "./core.ts";
import { isHighlightEnabled } from "./calclens-highlights.ts";

let attentionFilterActive = false;

export function getAttentionFilterActive(): boolean {
  return attentionFilterActive;
}

export function setAttentionFilterActive(on: boolean): void {
  attentionFilterActive = !!on;
}

/**
 * Filter rows to only those that carry at least one attention flag from a
 * currently-enabled rule.
 *
 * When the filter is inactive this is an identity function (returns the same
 * array reference). When active it returns a new array — the input is never
 * mutated.
 *
 * @param rows  The rows to filter (already search- and split-filtered).
 * @param opts  teamMembers and groupScope from Settings, forwarded to computeAttention.
 */
export function applyAttentionFilter(
  rows: ViewerRow[],
  opts: { teamMembers: string[]; groupScope: string[] }
): ViewerRow[] {
  if (!attentionFilterActive) return rows;
  return rows.filter((row) => {
    const flags = computeAttention(row, opts);
    return flags.some((f) => isHighlightEnabled(f.id));
  });
}
