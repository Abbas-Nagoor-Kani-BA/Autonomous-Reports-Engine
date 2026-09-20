import { SN_REMOTE_FACTORY } from "../di/tokens.ts";
import type { SnRemoteFactory } from "../di/tokens.ts";
import type { SnRemote, TicketRecord } from "../data/datasource/sn-remote.ts";
import { valueOf } from "../core/scope/resolve-scope.ts";

/** Which SCTASKs to list. */
export type SctaskScope = "me" | "groups";

export type ListAssignedRequest = {
  instanceUrl: string;
  scope: SctaskScope;
  /** The current user's sys_id if the caller already has it; else resolved. */
  currentUserId?: string | null;
  onDiagnostic?: (d: any) => void;
};

/** One SCTASK row flattened to plain display strings for the list UI. */
export type SctaskRow = {
  sysId: string;
  number: string;
  shortDescription: string;
  state: string;
  assignmentGroup: string;
  assignedTo: string;
  updatedOn: string;
};

/** Fields fetched for the list (display + value via sysparm_display_value=all). */
export const SCTASK_LIST_FIELDS = [
  "sys_id",
  "number",
  "short_description",
  "state",
  "assignment_group",
  "assigned_to",
  "sys_updated_on"
];

const NO_INSTANCE =
  "No instance URL configured \u2014 set your ServiceNow instance URL in Settings first.";

/** Per-row outcome reported to `onRow` as each write settles. */
export type RowResult = { sysId: string; ok: boolean; error?: string };

/** Final tally after a bulk run. `results` preserves input order. */
export type BulkSummary = {
  succeeded: number;
  failed: number;
  results: RowResult[];
};

/** One per-ticket write target (used when posting resolved per-ticket text). */
export type BulkUpdateItem = { sysId: string; comments?: string; workNotes?: string };

export type BulkUpdateRequest = {
  instanceUrl: string;
  sysIds: string[];
  comments?: string;
  workNotes?: string;
  /**
   * Per-ticket text. When present it takes precedence over the shared
   * comments/workNotes: each item is written with its OWN text. The page builds
   * this via `resolveItems` (shared-vs-override already applied), so the service
   * just writes what it is given.
   */
  items?: BulkUpdateItem[];
  /** Called as each row settles, in order, for live per-row UI. */
  onRow?: (result: RowResult) => void;
  onDiagnostic?: (d: any) => void;
};

export type CopyLastWorkNoteRequest = {
  instanceUrl: string;
  sysId: string;
  onDiagnostic?: (d: any) => void;
};

/** Per-row work-note presence, reported to `onRow` as each check settles. */
export type WorkNoteCheck = { sysId: string; hasWorkNote: boolean };

/** Result of a work-note check across a set of SCTASKs. */
export type CheckWorkNotesSummary = {
  /** sysIds that have NO work note (the ones to flag). */
  missing: string[];
  results: WorkNoteCheck[];
};

export type CheckWorkNotesRequest = {
  instanceUrl: string;
  sysIds: string[];
  onRow?: (check: WorkNoteCheck) => void;
  onDiagnostic?: (d: any) => void;
};

/** The display label of a reference/plain cell, trimmed. */
function displayOf(cell: unknown): string {
  if (cell && typeof cell === "object") {
    const dv = (cell as { display_value?: unknown }).display_value;
    const v = (cell as { value?: unknown }).value;
    return String(dv ?? v ?? "").trim();
  }
  return String(cell ?? "").trim();
}

/**
 * Lists the current user's SCTASKs for the bulk-update page.
 *
 * Scope "me" reads `assigned_to=<userId>^active=true`; scope "groups" resolves
 * the user's active group sys_ids and reads
 * `assignment_groupIN<ids>^active=true`. Rows are flattened to plain display
 * strings so the UI never touches the `{display_value,value}` shape.
 *
 * This is the read half of the feature; the write half (bulkUpdate) lands in a
 * later task. Both share this service so the page has one dependency.
 */
export class SctaskBulkService {
  static readonly deps = [SN_REMOTE_FACTORY] as const;

  private readonly remoteFactory: SnRemoteFactory;

  constructor(remoteFactory: SnRemoteFactory) {
    this.remoteFactory = remoteFactory;
  }

  async listAssigned(req: ListAssignedRequest): Promise<SctaskRow[]> {
    if (!req.instanceUrl) throw new Error(NO_INSTANCE);
    const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);

    const userId = String(req.currentUserId ?? "").trim() || (await remote.currentUserId()) || "";
    if (!userId) {
      throw new Error(
        "Could not determine the current ServiceNow user. Open and refresh your ServiceNow tab, then try again."
      );
    }

    const query = await this.#buildQuery(remote, req.scope, userId);
    if (query === null) return [];
    const rows = await remote.listSctasks(query, SCTASK_LIST_FIELDS);
    return rows.map(normalizeRow);
  }

  /**
   * Appends the same comment and/or work note to each selected SCTASK.
   *
   * Writes are SEQUENTIAL (not parallel): ServiceNow rate-limits, and the
   * shared client already backs off on 429, so one-at-a-time keeps the run
   * polite and the per-row order deterministic for the UI. A failed row does
   * NOT abort the run — every row is attempted and its outcome reported via
   * `onRow`, then tallied in the returned summary.
   *
   * Rejects (before any write) when nothing is selected or both fields are
   * empty, so the confirm UI can guard cheaply and we never issue a no-op PATCH.
   */
  async bulkUpdate(req: BulkUpdateRequest): Promise<BulkSummary> {
    if (!req.instanceUrl) throw new Error(NO_INSTANCE);
    const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);

    // Per-ticket path: each item carries its own already-resolved text.
    if (req.items && req.items.length) {
      const items = req.items
        .map((i) => ({
          sysId: String(i.sysId ?? "").trim(),
          comments: String(i.comments ?? "").trim(),
          workNotes: String(i.workNotes ?? "").trim()
        }))
        .filter((i) => i.sysId && (i.comments || i.workNotes));
      if (!items.length) throw new Error("Nothing to post — enter a comment or a work note.");
      const byId = new Map(items.map((i) => [i.sysId, i]));
      return this.#runSequential(
        items.map((i) => i.sysId),
        req.onRow,
        (sysId) => {
          const item = byId.get(sysId);
          return remote.updateSctaskJournals(sysId, {
            comments: item?.comments,
            workNotes: item?.workNotes
          });
        }
      );
    }

    // Shared path: the same text for every selected ticket.
    const sysIds = (req.sysIds || []).map((s) => String(s ?? "").trim()).filter(Boolean);
    if (!sysIds.length) throw new Error("Select at least one SCTASK to update.");
    const comments = String(req.comments ?? "").trim();
    const workNotes = String(req.workNotes ?? "").trim();
    if (!comments && !workNotes) {
      throw new Error("Enter a comment or a work note to post.");
    }

    return this.#runSequential(sysIds, req.onRow, (sysId) =>
      remote.updateSctaskJournals(sysId, { comments, workNotes })
    );
  }

  /**
   * The most recent work note on one SCTASK, for the "copy last work note"
   * button that pre-fills the work-notes box. Returns "" when there is none.
   */
  async copyLastWorkNote(req: CopyLastWorkNoteRequest): Promise<string> {
    if (!req.instanceUrl) throw new Error(NO_INSTANCE);
    const sysId = String(req.sysId ?? "").trim();
    if (!sysId) throw new Error("No SCTASK selected.");
    const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);
    return (await remote.fetchLastWorkNote(sysId)) ?? "";
  }

  /**
   * Checks each SCTASK for an existing work note (sequentially, rate-limit
   * friendly). Reports each result via `onRow` for live progress and returns
   * the `missing` sysIds (no work note) plus the full per-row results.
   *
   * A read failure is treated as "has a work note" (conservative: we don't flag
   * a ticket as missing when we simply couldn't read it), so flagging never
   * produces false positives from transient errors.
   */
  async checkWorkNotes(req: CheckWorkNotesRequest): Promise<CheckWorkNotesSummary> {
    if (!req.instanceUrl) throw new Error(NO_INSTANCE);
    const sysIds = (req.sysIds || []).map((s) => String(s ?? "").trim()).filter(Boolean);
    const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);

    const results: WorkNoteCheck[] = [];
    for (const sysId of sysIds) {
      let hasWorkNote: boolean;
      try {
        const note = await remote.fetchLastWorkNote(sysId);
        hasWorkNote = !!(note && note.trim());
      } catch {
        hasWorkNote = true; // don't flag on a read error
      }
      const check: WorkNoteCheck = { sysId, hasWorkNote };
      results.push(check);
      req.onRow?.(check);
    }
    return { missing: results.filter((r) => !r.hasWorkNote).map((r) => r.sysId), results };
  }

  /**
   * The reusable sequential-write engine: runs `write` for each id in order,
   * continues past failures, reports each outcome to `onRow`, and returns the
   * ordered summary. Kept generic (a plain write callback) so a future
   * bulk-assignment action can reuse it unchanged.
   */
  async #runSequential(
    sysIds: string[],
    onRow: ((result: RowResult) => void) | undefined,
    write: (sysId: string) => Promise<unknown>
  ): Promise<BulkSummary> {
    const results: RowResult[] = [];
    for (const sysId of sysIds) {
      let result: RowResult;
      try {
        await write(sysId);
        result = { sysId, ok: true };
      } catch (err) {
        result = { sysId, ok: false, error: String((err as Error)?.message || err) };
      }
      results.push(result);
      onRow?.(result);
    }
    return {
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }

  /**
   * Builds the encoded sc_task query for the scope. Returns null when the
   * "groups" scope resolves to zero groups (nothing to list) so the caller can
   * short-circuit without issuing a query that would match everything.
   */
  async #buildQuery(remote: SnRemote, scope: SctaskScope, userId: string): Promise<string | null> {
    if (scope === "groups") {
      const groupIds = await remote.fetchUserGroupIds(userId);
      if (!groupIds.length) return null;
      return `assignment_groupIN${groupIds.join(",")}^active=true`;
    }
    return `assigned_to=${userId}^active=true`;
  }
}

/** Flattens a raw sc_task record (display+value cells) to an `SctaskRow`. */
function normalizeRow(rec: TicketRecord): SctaskRow {
  return {
    sysId: valueOf(rec.sys_id as never),
    number: displayOf(rec.number),
    shortDescription: displayOf(rec.short_description),
    state: displayOf(rec.state),
    assignmentGroup: displayOf(rec.assignment_group),
    assignedTo: displayOf(rec.assigned_to),
    updatedOn: displayOf(rec.sys_updated_on)
  };
}
