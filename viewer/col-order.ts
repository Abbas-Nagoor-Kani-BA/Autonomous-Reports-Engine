/**
 * Pure column-order model for the Data View.
 *
 * The grid renders columns in the order of the COLUMNS array (see core.ts).
 * The user can drag headers to reorder; that preference is stored as a list of
 * column keys. This module turns a stored key order into a reordered column
 * list, without any DOM or storage — so it is unit-testable in plain node.
 *
 * Migration-safety is the whole point of the rules below: the stored order and
 * the current COLUMNS set can diverge across releases (a column added, removed
 * or renamed), and the reorder must never drop or duplicate a column.
 */
import type { ViewerCol } from "./core.ts";

/**
 * Reorder `cols` by the key order in `order`.
 *
 *  - Columns whose key appears in `order` are emitted first, in `order`'s
 *    sequence.
 *  - Columns NOT mentioned in `order` (e.g. a column added in a newer release)
 *    keep their original relative position, appended after — never dropped.
 *  - Keys in `order` that no longer exist in `cols` are ignored.
 *  - Duplicate keys in `order` are honored once (first occurrence).
 *
 * An empty/whole-invalid order is the identity (returns the same sequence).
 * The input array is never mutated.
 */
export function orderColumns(cols: ViewerCol[], order: string[] | null | undefined): ViewerCol[] {
  if (!Array.isArray(order) || order.length === 0) return cols.slice();

  const byKey = new Map<string, ViewerCol>();
  for (const col of cols) byKey.set(col[0], col);

  const result: ViewerCol[] = [];
  const placed = new Set<string>();

  for (const key of order) {
    if (placed.has(key)) continue;
    const col = byKey.get(key);
    if (col) {
      result.push(col);
      placed.add(key);
    }
  }

  // Append any columns the stored order did not mention, in original order.
  for (const col of cols) {
    if (!placed.has(col[0])) {
      result.push(col);
      placed.add(col[0]);
    }
  }

  return result;
}

/**
 * The key order that a reordered column list represents. Used to persist the
 * result of a drag as a flat key list.
 */
export function orderKeysOf(cols: ViewerCol[]): string[] {
  return cols.map((c) => c[0]);
}

/**
 * Move the column `fromKey` to sit immediately before (`placeBefore=true`) or
 * after (`placeBefore=false`) `toKey`, returning the resulting key order.
 *
 * Operates on the CURRENT visible/displayed column list so the result reflects
 * exactly what the user sees. No-op (returns current keys) when the keys are
 * missing or identical.
 */
export function reorderKeys(
  cols: ViewerCol[],
  fromKey: string,
  toKey: string,
  placeBefore: boolean
): string[] {
  const keys = orderKeysOf(cols);
  if (fromKey === toKey) return keys;
  const fromIdx = keys.indexOf(fromKey);
  const toIdx = keys.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0) return keys;

  keys.splice(fromIdx, 1);
  // Recompute the target index after removal.
  let insertAt = keys.indexOf(toKey);
  if (!placeBefore) insertAt += 1;
  keys.splice(insertAt, 0, fromKey);
  return keys;
}
