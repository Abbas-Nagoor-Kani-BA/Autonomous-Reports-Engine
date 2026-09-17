import { ServiceNowClient } from "../../lib/servicenow.ts";
import {
  queuesFromMembershipNames,
  membersFromMembershipNames,
  groupIdsFromMemberships,
  cisFromRows,
  mergeNames
} from "../../core/scope/resolve-scope.ts";

export type TicketRecord = Record<string, any>;
export type TimelineEvent = Record<string, any>;

export type FetchProgress = { fetched: number; total: number };
export type TimelineProgress = { ticketsDone: number; total: number };

/** The resolved current-user scope: display names ready to merge into settings. */
export type ResolvedScope = { queues: string[]; members: string[]; userId: string };

/** Active members of one group, with a flag when the read hit the page cap. */
export type ResolvedGroupMembers = { members: string[]; truncated: boolean };

/** Configuration items supported by one group, with a page-cap truncation flag. */
export type ResolvedGroupConfigItems = { items: string[]; truncated: boolean };

/**
 * Remote ServiceNow data access. The only place that knows about the Table API
 * and the activity feed.
 */
export interface SnRemote {
  count(table: string, encodedQuery: string): Promise<number>;
  fetchAllRecords(
    table: string,
    encodedQuery: string,
    fields: string[],
    onProgress?: (p: FetchProgress) => void,
    signal?: AbortSignal,
    expectedTotal?: number
  ): Promise<TicketRecord[]>;
  fetchTimelineEvents(
    sysIds: string[],
    fieldNames: string[],
    onProgress?: (p: TimelineProgress) => void,
    signal?: AbortSignal,
    tableName?: string
  ): Promise<Record<string, TimelineEvent[]>>;
  /**
   * Opt-in scope resolution for the Settings "Resolve members & queues" button.
   * Given the current user's sys_id (from the UI current-user endpoint or a page
   * global), reads the user's active group memberships → queue names, then each
   * group's active members → team-member names. Never called by the default
   * COUNT/RUN pull path.
   */
  resolveUserScope(currentUserId?: string | null): Promise<ResolvedScope>;
  /**
   * Opt-in: active members of a single group by NAME, for the per-queue
   * "resolve members" button. `truncated` is true when the read hit the page
   * cap (large common groups are not paginated by design).
   */
  resolveGroupMembers(groupName: string): Promise<ResolvedGroupMembers>;
  /**
   * Opt-in: configuration items supported by a single group by NAME
   * (`cmdb_ci.support_group`), for the per-queue "resolve CIs" button.
   * `truncated` is true when the read hit the page cap.
   */
  resolveGroupConfigItems(groupName: string): Promise<ResolvedGroupConfigItems>;
}

/** Structural type for the still-Javascript ServiceNowClient. */
export type ServiceNowClientLike = {
  count(table: string, encodedQuery: string): Promise<number>;
  fetchAllRecords(
    table: string,
    encodedQuery: string,
    fields: string[],
    onProgress?: (p: FetchProgress) => void,
    signal?: AbortSignal,
    expectedTotal?: number
  ): Promise<TicketRecord[]>;
  fetchTimelineEvents(
    sysIds: string[],
    fieldNames: string[],
    onProgress?: (p: TimelineProgress) => void,
    signal?: AbortSignal,
    tableName?: string
  ): Promise<Record<string, TimelineEvent[]>>;
  fetchRecords(
    table: string,
    encodedQuery: string,
    fields: string[],
    limit?: number
  ): Promise<Record<string, any>[]>;
  currentUserId(): Promise<string | null>;
  userNameById(userId: string): Promise<string | null>;
  fetchGroupMemberRows(
    groupName: string
  ): Promise<{ rows: Record<string, any>[]; truncated: boolean }>;
  fetchGroupCiRows(groupName: string): Promise<{ rows: Record<string, any>[]; truncated: boolean }>;
};

export class ServiceNowRemote implements SnRemote {
  private readonly client: ServiceNowClientLike;

  constructor(client: ServiceNowClientLike) {
    this.client = client;
  }

  count(table: string, encodedQuery: string): Promise<number> {
    return this.client.count(table, encodedQuery);
  }

  fetchAllRecords(
    table: string,
    encodedQuery: string,
    fields: string[],
    onProgress?: (p: FetchProgress) => void,
    signal?: AbortSignal,
    expectedTotal = 0
  ): Promise<TicketRecord[]> {
    return this.client.fetchAllRecords(
      table,
      encodedQuery,
      fields,
      onProgress,
      signal,
      expectedTotal
    );
  }

  fetchTimelineEvents(
    sysIds: string[],
    fieldNames: string[],
    onProgress?: (p: TimelineProgress) => void,
    signal?: AbortSignal,
    tableName = "incident"
  ): Promise<Record<string, TimelineEvent[]>> {
    return this.client.fetchTimelineEvents(sysIds, fieldNames, onProgress, signal, tableName);
  }

  async resolveUserScope(currentUserId?: string | null): Promise<ResolvedScope> {
    const userId = String(currentUserId ?? "").trim() || (await this.client.currentUserId()) || "";
    if (!userId) {
      throw new Error(
        "Could not determine the current ServiceNow user. Open and refresh your ServiceNow tab, then try again."
      );
    }

    // 1. The user's active group memberships → queue names. Request the
    //    dot-walked group.name so we get the group's display name regardless of
    //    how the `group` reference display column is configured.
    const membershipRows = await this.client.fetchRecords(
      "sys_user_grmember",
      `user=${userId}^group.active=true`,
      ["group", "group.name"]
    );
    const queues = queuesFromMembershipNames(membershipRows);
    const groupIds = groupIdsFromMemberships(membershipRows);
    if (!groupIds.length) {
      return { queues, members: [], userId };
    }

    // 2. Active members of those groups → team-member FULL names. Request the
    //    dot-walked user.name (full name) and user.active: some instances show
    //    the login/email as the `user` reference display value, which is not
    //    the full-name format the team-member list matches against.
    const memberRows = await this.client.fetchRecords(
      "sys_user_grmember",
      `groupIN${groupIds.join(",")}^user.active=true`,
      ["user", "user.name", "user.active", "group"]
    );
    let members = membersFromMembershipNames(memberRows);

    // Guarantee the current user appears in their own team list even when the
    // group-membership read omits them (some users belong via role/manager
    // access without an explicit sys_user_grmember row). Fetch their own full
    // name directly and merge it in.
    const selfName = await this.client.userNameById(userId);
    if (selfName) members = mergeNames([selfName], members);

    return { queues, members, userId };
  }

  async resolveGroupMembers(groupName: string): Promise<ResolvedGroupMembers> {
    const { rows, truncated } = await this.client.fetchGroupMemberRows(groupName);
    return { members: membersFromMembershipNames(rows), truncated };
  }

  async resolveGroupConfigItems(groupName: string): Promise<ResolvedGroupConfigItems> {
    const { rows, truncated } = await this.client.fetchGroupCiRows(groupName);
    return { items: cisFromRows(rows), truncated };
  }
}

export type ClientOptions = {
  pageSize?: number;
  debugResponses?: boolean;
  onDiagnostic?: (d: Record<string, any>) => void;
};

export function createServiceNowRemote(
  instanceUrl: string,
  transport: any,
  options: ClientOptions = {}
): SnRemote {
  const client = new ServiceNowClient(instanceUrl, {
    transport,
    onDiagnostic: options.onDiagnostic
  }) as unknown as ServiceNowClientLike;
  if (options.pageSize !== undefined) (client as any).pageSize = options.pageSize;
  if (options.debugResponses !== undefined) (client as any).debugResponses = options.debugResponses;
  return new ServiceNowRemote(client);
}

/** In-memory `SnRemote` for tests: scripted responses, recorded calls. */
export class FakeSnRemote implements SnRemote {
  readonly calls: { method: string; args: unknown[] }[] = [];
  counts: Record<string, number> = {};
  records: Record<string, TicketRecord[]> = {};
  timelines: Record<string, TimelineEvent[]> = {};
  scope: ResolvedScope = { queues: [], members: [], userId: "" };
  scopeError: Error | null = null;
  groupMembers: Record<string, ResolvedGroupMembers> = {};
  groupMembersError: Error | null = null;
  groupConfigItems: Record<string, ResolvedGroupConfigItems> = {};
  groupConfigItemsError: Error | null = null;

  async count(table: string, encodedQuery: string): Promise<number> {
    this.calls.push({ method: "count", args: [table, encodedQuery] });
    return this.counts[`${table}|${encodedQuery}`] ?? 0;
  }

  async fetchAllRecords(
    table: string,
    encodedQuery: string,
    fields: string[],
    onProgress?: (p: FetchProgress) => void
  ): Promise<TicketRecord[]> {
    this.calls.push({ method: "fetchAllRecords", args: [table, encodedQuery, fields] });
    const records = this.records[`${table}|${encodedQuery}`] ?? [];
    onProgress?.({ fetched: records.length, total: records.length });
    return records;
  }

  async fetchTimelineEvents(
    sysIds: string[],
    fieldNames: string[],
    onProgress?: (p: TimelineProgress) => void
  ): Promise<Record<string, TimelineEvent[]>> {
    this.calls.push({ method: "fetchTimelineEvents", args: [sysIds, fieldNames] });
    const out: Record<string, TimelineEvent[]> = {};
    let done = 0;
    for (const id of sysIds) {
      if (this.timelines[id]) out[id] = this.timelines[id];
      done++;
      onProgress?.({ ticketsDone: done, total: sysIds.length });
    }
    return out;
  }

  async resolveUserScope(currentUserId?: string | null): Promise<ResolvedScope> {
    this.calls.push({ method: "resolveUserScope", args: [currentUserId ?? null] });
    if (this.scopeError) throw this.scopeError;
    return { ...this.scope, userId: this.scope.userId || String(currentUserId ?? "") };
  }

  async resolveGroupMembers(groupName: string): Promise<ResolvedGroupMembers> {
    this.calls.push({ method: "resolveGroupMembers", args: [groupName] });
    if (this.groupMembersError) throw this.groupMembersError;
    return this.groupMembers[groupName] ?? { members: [], truncated: false };
  }

  async resolveGroupConfigItems(groupName: string): Promise<ResolvedGroupConfigItems> {
    this.calls.push({ method: "resolveGroupConfigItems", args: [groupName] });
    if (this.groupConfigItemsError) throw this.groupConfigItemsError;
    return this.groupConfigItems[groupName] ?? { items: [], truncated: false };
  }
}
