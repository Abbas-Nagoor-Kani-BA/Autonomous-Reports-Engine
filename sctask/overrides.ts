/**
 * Per-ticket comment/work-note overrides and the shared-vs-override resolution
 * rule for the Bulk SCTASK Update page.
 *
 * Shared text (the page's two textareas) is the default for every selected
 * ticket. A ticket that was edited via the popup carries its own override,
 * which wins PER FIELD: `resolve` uses the override's comments/workNotes when
 * that field is set, else falls back to the shared value. Kept free of the DOM
 * so the rule is unit-testable.
 */

export type Override = { comments?: string; workNotes?: string };
export type Shared = { comments: string; workNotes: string };

/** One resolved write target: the text a single ticket will actually receive. */
export type ResolvedItem = { sysId: string; comments: string; workNotes: string };

export class OverrideStore {
  private readonly map = new Map<string, Override>();

  /** Sets (or clears) a ticket's override. Empty/blank fields are dropped; an
   *  override with no non-blank field is removed entirely. */
  set(sysId: string, override: Override): void {
    const comments = String(override.comments ?? "").trim();
    const workNotes = String(override.workNotes ?? "").trim();
    if (!comments && !workNotes) {
      this.map.delete(sysId);
      return;
    }
    const next: Override = {};
    if (comments) next.comments = comments;
    if (workNotes) next.workNotes = workNotes;
    this.map.set(sysId, next);
  }

  clear(sysId: string): void {
    this.map.delete(sysId);
  }

  get(sysId: string): Override | undefined {
    return this.map.get(sysId);
  }

  has(sysId: string): boolean {
    return this.map.has(sysId);
  }

  /** sysIds that currently carry an override. */
  keys(): string[] {
    return [...this.map.keys()];
  }
}

/**
 * Resolves the final text for each selected ticket: per field, the override
 * wins when present, else the shared value is used. Only tickets whose resolved
 * text has at least one non-empty field are returned (a ticket with no text at
 * all is not postable and is dropped here).
 */
export function resolveItems(
  sysIds: string[],
  shared: Shared,
  overrides: OverrideStore
): ResolvedItem[] {
  const sharedComments = String(shared.comments ?? "").trim();
  const sharedWorkNotes = String(shared.workNotes ?? "").trim();
  const out: ResolvedItem[] = [];
  for (const sysId of sysIds) {
    const ov = overrides.get(sysId);
    const comments = ov?.comments ?? sharedComments;
    const workNotes = ov?.workNotes ?? sharedWorkNotes;
    if (comments || workNotes) out.push({ sysId, comments, workNotes });
  }
  return out;
}
