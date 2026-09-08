import type { ViewerRow } from "./core.ts";

export type ColumnEntry = { sysId: string; number: string; value: string };

/** Build the per-row entries for a single column across the given rows, in order.
 *  Pure (no DOM / chrome); value is the raw field stringified, display formatting
 *  is applied by the component's injected displayFor. */
export function columnEntries(rows: ViewerRow[], key: string): ColumnEntry[] {
  const out: ColumnEntry[] = [];
  for (const row of rows || []) {
    const raw = row[key];
    out.push({
      sysId: String(row.sysId ?? ""),
      number: String(row.number ?? ""),
      value: raw === null || raw === undefined ? "" : String(raw)
    });
  }
  return out;
}

/** Index of the entry with the given sysId, or -1. */
export function focusedIndexOf(entries: ColumnEntry[], sysId: string): number {
  const target = String(sysId ?? "");
  return (entries || []).findIndex((e) => e.sysId === target);
}
