type Row = Record<string, unknown>;

/** True for catalog tasks (SCTASK…), whose parent is a request item (RITM). */
export function isScTask(row: Row): boolean {
  return String(row.number ?? "")
    .toUpperCase()
    .startsWith("SCTASK");
}

/**
 * True for any RFS-classified ticket. RFS work reaches the export as a catalog
 * task (SCTASK), a request (REQ) or a request item (RITM) — mirrors the RFS
 * mapping in msrType/deriveType. Used so the priority cell shows "RFS" for all
 * of them, not just SCTASK rows.
 */
export function isRfs(row: Row): boolean {
  const n = String(row.number ?? "").toUpperCase();
  return n.startsWith("SCTASK") || n.startsWith("REQ") || n.startsWith("RITM");
}

/**
 * The ticket number to display/export. For catalog tasks this is the parent
 * RITM number (row.requestItem); if that is missing it falls back to the
 * SCTASK number. All other ticket types use their own number unchanged.
 */
export function displayNumber(row: Row): string {
  if (isScTask(row)) {
    const ritm = String(row.requestItem ?? "").trim();
    if (ritm) return ritm;
  }
  return String(row.number ?? "");
}

/**
 * The priority cell for MSR copy / export. RFS work (SCTASK / REQ / RITM) is
 * tracked as the literal "RFS" rather than a numeric priority. Every other
 * ticket type passes its priority through unchanged.
 */
export function priorityCell(row: Row): string {
  if (isRfs(row)) return "RFS";
  return row.priority === null || row.priority === undefined ? "" : String(row.priority);
}
