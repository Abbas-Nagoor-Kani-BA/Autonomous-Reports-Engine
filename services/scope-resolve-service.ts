import { SN_REMOTE_FACTORY } from "../di/tokens.ts";
import type { SnRemoteFactory } from "../di/tokens.ts";
import type {
  ResolvedScope,
  ResolvedGroupMembers,
  ResolvedGroupConfigItems
} from "../data/datasource/sn-remote.ts";

export type ResolveScopeRequest = {
  instanceUrl: string;
  /** The current user's sys_id, if the caller already read it from a page
   *  global. When omitted the remote asks the current-user REST endpoint. */
  currentUserId?: string | null;
  onDiagnostic?: (d: any) => void;
};

const PERMISSION_HINT =
  "Could not resolve your groups and members from ServiceNow \u2014 your account may not have permission to read the group tables. Add queues and team members manually in Settings.";

/**
 * Opt-in resolver for the Settings "Resolve members & queues" button.
 *
 * Builds a remote for the instance and asks it for the current user's queues
 * (their active group memberships) and each queue's active members. This is the
 * ONE place in the app that reads sys_user_grmember at runtime; the default
 * COUNT/RUN pull path never calls it, so restricted users who never press the
 * button are unaffected.
 *
 * Permission failures (401/403) and an empty membership set are mapped to a
 * single friendly message telling the user to add names manually, so the UI can
 * surface it verbatim.
 */
export class ScopeResolveService {
  static readonly deps = [SN_REMOTE_FACTORY] as const;

  private readonly remoteFactory: SnRemoteFactory;

  constructor(remoteFactory: SnRemoteFactory) {
    this.remoteFactory = remoteFactory;
  }

  async resolve(req: ResolveScopeRequest): Promise<ResolvedScope> {
    if (!req.instanceUrl) {
      throw new Error(
        "No instance URL configured \u2014 set your ServiceNow instance URL in Settings first."
      );
    }
    let scope: ResolvedScope;
    try {
      const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);
      scope = await remote.resolveUserScope(req.currentUserId ?? undefined);
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (/\b(401|403)\b/.test(msg) || /permission|forbidden|not logged in/i.test(msg)) {
        throw new Error(PERMISSION_HINT);
      }
      throw err;
    }
    if (!scope.queues.length && !scope.members.length) {
      throw new Error(PERMISSION_HINT);
    }
    return scope;
  }

  /**
   * Active members of one group, for the per-queue "resolve members" button.
   * Permission failures map to the friendly hint; an empty result is NOT an
   * error (a group can legitimately have zero active members) — the UI reports
   * "no members" instead.
   */
  async resolveGroupMembers(req: {
    instanceUrl: string;
    group: string;
    onDiagnostic?: (d: any) => void;
  }): Promise<ResolvedGroupMembers> {
    if (!req.instanceUrl) {
      throw new Error(
        "No instance URL configured \u2014 set your ServiceNow instance URL in Settings first."
      );
    }
    if (!req.group || !req.group.trim()) {
      throw new Error("No group name given.");
    }
    try {
      const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);
      return await remote.resolveGroupMembers(req.group.trim());
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (/\b(401|403)\b/.test(msg) || /permission|forbidden|not logged in/i.test(msg)) {
        throw new Error(PERMISSION_HINT);
      }
      throw err;
    }
  }

  /**
   * Configuration items supported by one group, for the per-queue "resolve CIs"
   * button. Same graceful-failure contract as `resolveGroupMembers`: permission
   * failures map to the friendly hint; an empty result is valid.
   */
  async resolveGroupConfigItems(req: {
    instanceUrl: string;
    group: string;
    onDiagnostic?: (d: any) => void;
  }): Promise<ResolvedGroupConfigItems> {
    if (!req.instanceUrl) {
      throw new Error(
        "No instance URL configured \u2014 set your ServiceNow instance URL in Settings first."
      );
    }
    if (!req.group || !req.group.trim()) {
      throw new Error("No group name given.");
    }
    try {
      const remote = await this.remoteFactory(req.instanceUrl, req.onDiagnostic);
      return await remote.resolveGroupConfigItems(req.group.trim());
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (/\b(401|403)\b/.test(msg) || /permission|forbidden|not logged in/i.test(msg)) {
        throw new Error(PERMISSION_HINT);
      }
      throw err;
    }
  }
}
