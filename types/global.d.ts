// Ambient globals that resolve across the repo's classic/ES module boundary.
// Declared with `var` (not `const`) so they also become properties of
// `typeof globalThis` — the code reads `globalThis.chrome` / `globalThis.Analysis`.
export {};

declare global {
  var chrome: any;
  var fflate: any;
  var g_ck: any;
  var g_user_id: any;
  var g_user: any;
  var Analysis: any;
  var AiExtract: any;
  var Markup: any;
  var Journal: any;
  var Report: any;
  var RowMerge: any;
  var TemplateXml: any;
  var MsrChoices: any;

  // Decorated by ServiceNowClient#request (lib/servicenow.js) on the
  // Response object returned by the pluggable transport.
  interface Response {
    snVia?: string | null;
    snHadToken?: boolean | null;
    snTokenSource?: string | null;
  }
}

// Cross-context message protocol. RUN/COUNT flow panel -> background;
// PROGRESS/DATA_UPDATED flow background -> panel. Reused by JSDoc in callers.
export type MsgRun = {
  type: "RUN";
  instanceUrl: string;
  groups: string[];
  filterSets: { table: string; conditions: unknown[]; queueNames?: string[] }[];
  filters?: Record<string, unknown>;
  fields?: string[];
  maxTickets?: number;
  /** When true, additionally pull change_request rows for the weekly Summary. */
  includeChangeSummary?: boolean;
  /** Editable weekly-summary windows; when omitted or not overridden the defaults are recomputed. */
  changeSummaryWindows?: import("../core/summary/change-summary-filter.ts").ChangeSummaryWindows;
};
export type MsgCount = {
  type: "COUNT";
  instanceUrl: string;
  groups: string[];
  filterSets?: { table: string; conditions: unknown[] }[];
  filters?: Record<string, unknown>;
};
export type MsgProgress = {
  type: "PROGRESS";
  stage: string;
  detail?: unknown;
  [k: string]: unknown;
};
export type MsgDataUpdated = { type: "DATA_UPDATED" };
export type MsgSnFetch = {
  type: "SN_FETCH";
  url: string;
  token: string;
  method?: string;
  body?: unknown;
};
export type MsgResolveScope = {
  type: "RESOLVE_SCOPE";
  instanceUrl: string;
  /** Optional current-user sys_id; the worker resolves one when omitted. */
  currentUserId?: string | null;
};
export type MsgResolveGroupMembers = {
  type: "RESOLVE_GROUP_MEMBERS";
  instanceUrl: string;
  group: string;
};
export type MsgResolveGroupCis = {
  type: "RESOLVE_GROUP_CIS";
  instanceUrl: string;
  group: string;
};
export type MsgSctaskList = {
  type: "SCTASK_LIST";
  instanceUrl: string;
  scope: "me" | "groups";
  currentUserId?: string | null;
};
export type MsgSctaskBulkUpdate = {
  type: "SCTASK_BULK_UPDATE";
  instanceUrl: string;
  sysIds: string[];
  comments?: string;
  workNotes?: string;
};
export type MsgSctaskLastWorkNote = {
  type: "SCTASK_LAST_WORKNOTE";
  instanceUrl: string;
  sysId: string;
};
export type MsgSctaskCheckWorkNotes = {
  type: "SCTASK_CHECK_WORKNOTES";
  instanceUrl: string;
  sysIds: string[];
};
export type BackgroundMessage =
  | MsgRun
  | MsgCount
  | MsgProgress
  | MsgDataUpdated
  | MsgSnFetch
  | MsgResolveScope
  | MsgResolveGroupMembers
  | MsgResolveGroupCis
  | MsgSctaskList
  | MsgSctaskBulkUpdate
  | MsgSctaskLastWorkNote
  | MsgSctaskCheckWorkNotes;
