import { $, COLUMNS } from "./core.ts";
import type { ViewerRow } from "./core.ts";
import { dataStore } from "./store.ts";
import { rowMatches } from "./search-match.ts";
import type { DisplayValue } from "./search-match.ts";
import { getSearchColumn, getSearchMode, isCaseSensitive } from "./search-state.ts";
import { applySplitFilter } from "./split-filter.ts";
import { applyAttentionFilter, getAttentionFilterActive } from "./attention-filter.ts";
import { rowOffsetMs } from "../../core/sntime.ts";

function st() { return dataStore.getState(); }

// The value the search matches against, per column. Injected at boot with
// exportSvc.cellValue so search matches the displayed/exported value (and thus
// aligns with what copy/export emit). Until injected, fall back to the raw row
// field so the module works standalone (and in unit tests).
let displayValue: DisplayValue = (row, key) => {
  const v = row[key];
  return v === null || v === undefined ? "" : String(v);
};

/** Inject the displayed/export value resolver (exportSvc.cellValue-bound). */
function setDisplayValueResolver(fn: DisplayValue): void {
  if (typeof fn === "function") displayValue = fn;
}

// Resolver for the attention filter's teamMembers/groupScope. Injected by
// grid.ts initGrid() so this module stays free of chrome.* imports (same
// pattern as setDisplayValueResolver above).
type AttentionCtxResolver = () => { teamMembers: string[]; groupScope: string[] };
let attentionCtxResolver: AttentionCtxResolver = () => ({ teamMembers: [], groupScope: [] });

/** Inject the attention context resolver (grid.ts attentionCtx-bound). */
function setAttentionCtxResolver(fn: AttentionCtxResolver): void {
  if (typeof fn === "function") attentionCtxResolver = fn;
}

function currentRows(): ViewerRow[] {
  const { data, sortKey, sortDir } = st();
  let rows = data ? [...data.rows] : [];
  const q = $("search").value;
  if (q.trim()) {
    const opts = { column: getSearchColumn(), mode: getSearchMode(), caseSensitive: isCaseSensitive() };
    rows = rows.filter((r) => rowMatches(r, q, opts, displayValue, COLUMNS));
  }
  rows = applySplitFilter(rows);
  if (getAttentionFilterActive()) rows = applyAttentionFilter(rows, attentionCtxResolver());
  if (sortKey) {
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const na = Number(va), nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb) && va !== "" && vb !== "") {
        return (na - nb) * sortDir;
      }
      return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true }) * sortDir;
    });
  }
  return rows;
}

function hasDataRows(): boolean {
  const data = st().data;
  return !!(data && data.rows.length);
}

function parseLocalInput(text: string): Date | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  }
  const dmy = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    return new Date(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0), +(dmy[6] || 0));
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a date/time string typed by the user in the instance clock and return
 * a Date representing the correct UTC moment.
 *
 * fmtInstant displays UTC timestamps as instance-local wall-clock time by
 * adding instanceOffset to the UTC epoch. The inverse (what the user typed ->
 * UTC) is therefore: parse the display digits as if they were UTC, then
 * subtract instanceOffset.
 *
 * @param text  The string the user typed (same format fmtInstant produces).
 * @param row   The row being edited (provides the instance offset via its
 *              openedAt / openedAtRaw pair).
 * @param snOffsetMs  Fallback instance offset when the row pair is missing.
 */
export function parseInstanceInput(
  text: string,
  row: ViewerRow | null | undefined,
  snOffsetMs: number
): Date | null {
  const s = text.trim();
  if (!s) return null;

  let y: number, mo: number, d: number, h = 0, mi = 0, sec = 0;

  // yyyy-MM-dd HH:mm[:ss]
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    y = +m[1]; mo = +m[2] - 1; d = +m[3]; h = +m[4]; mi = +m[5]; sec = +(m[6] || 0);
  } else {
    // dd-MM-yyyy HH:mm[:ss]  (the format fmtInstant produces)
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      y = +m[3]; mo = +m[2] - 1; d = +m[1]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0);
    } else {
      // fallback: let the engine parse it (may be ambiguous)
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // Treat the typed digits as instance-clock wall-clock time.
  // fmtInstant: display = UTC + instanceOffset  =>  UTC = display - instanceOffset.
  const displayAsUtcMs = Date.UTC(y, mo, d, h, mi, sec);
  const instanceOffset = rowOffsetMs(row ?? undefined, snOffsetMs);
  return new Date(displayAsUtcMs - instanceOffset);
}

export { currentRows, hasDataRows, parseLocalInput, setDisplayValueResolver, setAttentionCtxResolver };