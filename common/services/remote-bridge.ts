import { MSG } from "../../lib/keys.ts";
import { broadcast } from "../../lib/storage.ts";
import type {
  MsgCount,
  MsgProgress,
  MsgResolveScope,
  MsgResolveGroupMembers,
  MsgResolveGroupCis,
  MsgRun,
  MsgSctaskList,
  MsgSctaskBulkUpdate,
  MsgSctaskLastWorkNote
} from "../../types/global.d.ts";
import type {
  SctaskRow,
  BulkSummary
} from "../../services/sctask-bulk-service.ts";

/*
 * Page-side proxy for the service worker's message API.
 *
 * Extension pages cannot construct the remote-capable repositories (they need
 * the CSRF token and the content-script relay, which only exist in the worker).
 * This bridge gives pages the typed surface they DO need: preview, run, the
 * progress feed, and the data-changed broadcast. It owns the lastError check in
 * one place instead of each bootstrap hand-rolling chrome.runtime.sendMessage.
 */

export type CountReply = {
  ok: boolean;
  total?: number;
  encodedQuery?: string;
  limit?: number;
  error?: string;
};

export type RunReply = {
  ok: boolean;
  started?: boolean;
  error?: string;
};

export type ResolveScopeReply = {
  ok: boolean;
  queues?: string[];
  members?: string[];
  userId?: string;
  error?: string;
};

export type ResolveGroupMembersReply = {
  ok: boolean;
  members?: string[];
  truncated?: boolean;
  error?: string;
};

export type ResolveGroupCisReply = {
  ok: boolean;
  items?: string[];
  truncated?: boolean;
  error?: string;
};

export type SctaskListReply = {
  ok: boolean;
  rows?: SctaskRow[];
  error?: string;
};

export type SctaskBulkUpdateReply = {
  ok: boolean;
  summary?: BulkSummary;
  error?: string;
};

export type SctaskLastWorkNoteReply = {
  ok: boolean;
  workNote?: string;
  error?: string;
};

export type BridgeMsg = {
  type?: unknown;
  [key: string]: unknown;
};

export class RemoteBridge {
  static readonly deps = [] as const;

  /**
   * Sends a message to the service worker and resolves with its reply.
   * Uses the callback form so `chrome.runtime.lastError` is checked in one
   * place; pages that awaited a raw sendMessage would miss it.
   */
  private request(
    msg:
      | MsgCount
      | MsgRun
      | MsgResolveScope
      | MsgResolveGroupMembers
      | MsgResolveGroupCis
      | MsgSctaskList
      | MsgSctaskBulkUpdate
      | MsgSctaskLastWorkNote
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (res: unknown) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });
  }

  /** Preview count for the panel's Run button. */
  preview(req: Omit<MsgCount, "type">): Promise<CountReply> {
    return this.request({ type: MSG.count, ...req }) as Promise<CountReply>;
  }

  /** Kicks off a pull in the worker. Fire-and-forget from the page's side. */
  run(req: Omit<MsgRun, "type">): Promise<RunReply> {
    return this.request({ type: MSG.run, ...req }) as Promise<RunReply>;
  }

  /**
   * Opt-in: resolves the current user's groups (queues) and each group's active
   * members from ServiceNow, for the Settings Resolve button. Never used by the
   * default COUNT/RUN pull path.
   */
  resolveScope(req: Omit<MsgResolveScope, "type">): Promise<ResolveScopeReply> {
    return this.request({ type: MSG.resolveScope, ...req }) as Promise<ResolveScopeReply>;
  }

  /**
   * Opt-in: resolves the active members of ONE group by name, for the per-queue
   * "resolve members" button. Reply carries a `truncated` flag when the group
   * exceeded the single-page read.
   */
  resolveGroupMembers(
    req: Omit<MsgResolveGroupMembers, "type">
  ): Promise<ResolveGroupMembersReply> {
    return this.request({
      type: MSG.resolveGroupMembers,
      ...req
    }) as Promise<ResolveGroupMembersReply>;
  }

  /**
   * Opt-in: resolves the configuration items supported by ONE group by name
   * (`cmdb_ci.support_group`), for the per-queue "resolve CIs" button. Reply
   * carries a `truncated` flag when the group exceeded the single-page read.
   */
  resolveGroupCis(req: Omit<MsgResolveGroupCis, "type">): Promise<ResolveGroupCisReply> {
    return this.request({ type: MSG.resolveGroupCis, ...req }) as Promise<ResolveGroupCisReply>;
  }

  /** Lists the current user's SCTASKs for the bulk-update page. */
  listSctasks(req: Omit<MsgSctaskList, "type">): Promise<SctaskListReply> {
    return this.request({ type: MSG.sctaskList, ...req }) as Promise<SctaskListReply>;
  }

  /**
   * Appends the same comment/work note to each selected SCTASK. Per-row results
   * stream via `onProgress` (stage "sctaskRow"); this resolves with the final
   * summary.
   */
  bulkUpdateSctasks(req: Omit<MsgSctaskBulkUpdate, "type">): Promise<SctaskBulkUpdateReply> {
    return this.request({ type: MSG.sctaskBulkUpdate, ...req }) as Promise<SctaskBulkUpdateReply>;
  }

  /** Reads the newest work note on one SCTASK, for the copy-last-work-note button. */
  copyLastWorkNote(req: Omit<MsgSctaskLastWorkNote, "type">): Promise<SctaskLastWorkNoteReply> {
    return this.request({
      type: MSG.sctaskLastWorkNote,
      ...req
    }) as Promise<SctaskLastWorkNoteReply>;
  }

  /** Broadcasts that the dataset changed (e.g. a clear-cache, an export view). */
  notifyDataUpdated(): void {
    broadcast({ type: MSG.dataUpdated });
  }

  /**
   * Subscribes to worker progress broadcasts. Returns an unsubscribe fn so
   * repeated init cannot double-register the same page's listener.
   */
  onProgress(handler: (msg: MsgProgress) => void): () => void {
    const listener = (msg: BridgeMsg): void => {
      if (msg?.type !== MSG.progress) return;
      handler(msg as MsgProgress);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }
}
