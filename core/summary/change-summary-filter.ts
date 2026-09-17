import { weekRanges } from "./summarydetails.ts";
import { encodeConditions } from "../query/querybuilder.ts";

// ---------------------------------------------------------------------------
// Pure weekly-summary window model (no I/O, no DOM).
//
// Models the two change_request queries the Weekly Summary pull issues:
//   - lastWeek  : end_date   BETWEEN last week's Monday..Sunday     (implemented)
//   - nextWeek  : start_date BETWEEN the CURRENT week's Monday..Sunday (planned)
//
// Note: the "planned" window is named nextWeek and labelled "next week" in the
// UI for historical reasons, but it deliberately covers the CURRENT week's
// start_date (changes planned to begin this week).
//
// Each window carries an optional list of extra change_request conditions
// (the panel condition shape) appended AFTER the date anchor using the exact
// encoding rules of core/query/querybuilder.ts. With no extra conditions the
// encoded query is byte-identical to the legacy #pullChangeSummary output.
// ---------------------------------------------------------------------------

/** The panel condition shape used by the condition builder. */
export type PanelCondition = {
  join: "AND" | "OR";
  field: string;
  oper: string;
  value: string;
  value2: string;
};

export type ChangeSummaryWindow = {
  /** 'end_date' for lastWeek, 'start_date' for nextWeek. */
  dateField: "end_date" | "start_date";
  /** Monday, YYYY-MM-DD. */
  from: string;
  /** Sunday, YYYY-MM-DD. */
  to: string;
  /** Extra change_request conditions beyond the date anchor. Empty by default. */
  conditions: PanelCondition[];
  /**
   * True when the user explicitly edited this window's from/to away from the
   * computed week. When false/absent, a stored override still auto-advances the
   * dates to the current week each resolve; only the conditions stay sticky.
   */
  datesCustom?: boolean;
};

export type ChangeSummaryWindows = {
  lastWeek: ChangeSummaryWindow;
  nextWeek: ChangeSummaryWindow;
  overridden: boolean;
};

/**
 * Build both windows from weekRanges(now) with empty extra conditions and
 * overridden:false. lastWeek keys on end_date (last week), nextWeek keys on
 * start_date (the CURRENT week; still named/labelled "next week").
 */
export function defaultChangeSummaryWindows(now: Date = new Date()): ChangeSummaryWindows {
  const weeks = weekRanges(now);
  return {
    lastWeek: {
      dateField: "end_date",
      from: weeks.last.from,
      to: weeks.last.to,
      conditions: []
    },
    nextWeek: {
      dateField: "start_date",
      from: weeks.current.from,
      to: weeks.current.to,
      conditions: []
    },
    overridden: false
  };
}

/**
 * Resolve the windows the pull/UI should use.
 *
 * Null/undefined or a non-override stored value recomputes the defaults from
 * `now`. For a stored OVERRIDE, the extra `conditions` stay sticky but the date
 * windows AUTO-ADVANCE to the current week each resolve, UNLESS the user
 * explicitly edited that window's dates (datesCustom === true), in which case
 * the stored from/to are kept. This stops an override from silently pinning a
 * stale week while still honouring a deliberate date edit.
 */
export function resolveChangeSummaryWindows(
  stored: ChangeSummaryWindows | null | undefined,
  now: Date = new Date()
): ChangeSummaryWindows {
  const defaults = defaultChangeSummaryWindows(now);
  if (!stored || stored.overridden !== true) return defaults;
  return {
    overridden: true,
    lastWeek: mergeWindow(defaults.lastWeek, stored.lastWeek),
    nextWeek: mergeWindow(defaults.nextWeek, stored.nextWeek)
  };
}

/**
 * Merge one stored window onto its fresh default: keep the stored conditions,
 * keep stored dates only when datesCustom is set, otherwise take the default
 * (current-week) dates. The dateField always follows the default so a window
 * cannot drift onto the wrong anchor.
 */
function mergeWindow(
  base: ChangeSummaryWindow,
  storedWin: ChangeSummaryWindow | null | undefined
): ChangeSummaryWindow {
  if (!storedWin) return base;
  const datesCustom = storedWin.datesCustom === true;
  return {
    dateField: base.dateField,
    from: datesCustom ? storedWin.from : base.from,
    to: datesCustom ? storedWin.to : base.to,
    conditions: Array.isArray(storedWin.conditions) ? storedWin.conditions : [],
    datesCustom
  };
}

/** Scope prefix: assignment_group.nameIN<names>^ or "" when no groups. */
function scopePrefix(groupNames: string[]): string {
  const names = groupNames || [];
  return names.length
    ? `assignment_group.nameIN${names.map((g) => String(g).replace(/['\\]/g, "")).join(",")}^`
    : "";
}

/**
 * Encode one window into an encoded-query string:
 *   <scope><date anchor>[^<extra conditions>]
 *
 * The date anchor MUST come first after the scope (SN evaluates encoded
 * queries strictly left-to-right). Extra conditions reuse querybuilder's
 * encodeConditions so joins (^ / ^OR) and value sanitisation match exactly.
 *
 * With no extra conditions this is byte-identical to legacy #pullChangeSummary.
 */
export function encodeChangeSummaryWindow(
  window: ChangeSummaryWindow,
  groupNames: string[]
): string {
  const scope = scopePrefix(groupNames);
  const anchor =
    `${window.dateField}BETWEENjavascript:gs.dateGenerate('${window.from}','00:00:00')` +
    `@javascript:gs.dateGenerate('${window.to}','23:59:59')`;
  const extra = encodeConditions(window.conditions);
  return `${scope}${anchor}${extra ? `^${extra}` : ""}`;
}
