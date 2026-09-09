/**
 * Per-ticket timeline extraction context. `queueName` and `snapshotGroupName`
 * are compared in name-space (lowercased/trimmed) via {@link nameKey}.
 */
import { parseSnDisplayMs } from "../core/sntime.ts";

export type ExtractCtx = {
  /** OOB state value->label map */
  stateMap: Record<string, string>;
  /** name-keyed target queue */
  queueName: string;
  /** plain team-member names for ackn detection */
  memberNames: string[];
  /** the ticket's current group display name */
  snapshotGroupName: string | null;
  /** raw opened_at string in UTC (no suffix) */
  openedAtUtcRaw: string;
};

export type Event = {
  field: string | undefined;
  oldValue: string;
  newValue: string;
  atEpoch: number;
};

export type Timeline = {
  assignTimeUtcIso: string | null;
  acknTimeUtcIso: string | null;
  suspendTimeUtcIso: string | null;
  resumeTimeUtcIso: string | null;
  resumeSource: string | null;
  onHoldCount: number;
  lastQueueEntryEpoch: number | null;
};

function parseUtc(s: string | null | undefined): number {
  if (!s) return NaN;
  const str = String(s).trim().replace(" ", "T");
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(str) ? str : str + "Z");
}

function nameKey(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function toIso(epoch: number): string {
  return new Date(epoch).toISOString();
}

function utcRawToEpochMs(s: string): number {
  return parseUtc(s);
}

function epochMsToUtcIso(n: number): string {
  return toIso(n);
}

function resolveLabel(stateMap: Record<string, string>, v: unknown): string {
  const raw = String(v ?? "").trim();
  return stateMap[raw] || raw;
}

type AuditRowLike = {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  at: string;
};

function normalizeEvents(auditRows: AuditRowLike[] | null | undefined): Event[] {
  return (auditRows || [])
    .map(r => ({
      field: r.field,
      oldValue: String(r.oldValue || ""),
      newValue: String(r.newValue || ""),
      atEpoch: utcRawToEpochMs(r.at)
    }))
    .filter(e => Number.isFinite(e.atEpoch))
    .sort((a, b) => a.atEpoch - b.atEpoch);
}

function createResult(): Timeline {
  return {
    assignTimeUtcIso: null,
    acknTimeUtcIso: null,
    suspendTimeUtcIso: null,
    resumeTimeUtcIso: null,
    resumeSource: null,
    onHoldCount: 0,
    lastQueueEntryEpoch: null
  };
}

function applyBornInQueueFallback(events: Event[], result: Timeline, ctx: ExtractCtx): { group: string | null; stays: QueueStay[] } {
  const inQueue = (g: unknown) => g != null && nameKey(g) === nameKey(ctx.queueName);
  const hasGroupEvent = events.some(e => e.field === "assignment_group");
  if (hasGroupEvent || !inQueue(ctx.snapshotGroupName)) return { group: null, stays: [] };
  const bornEpoch = utcRawToEpochMs(ctx.openedAtUtcRaw);
  if (!Number.isFinite(bornEpoch)) return { group: null, stays: [] };
  result.assignTimeUtcIso = epochMsToUtcIso(bornEpoch);
  result.lastQueueEntryEpoch = bornEpoch;
  return {
    group: ctx.snapshotGroupName,
    stays: [{ entryEpoch: bornEpoch, exitEpoch: null, memberAcks: [] }]
  };
}

type QueueStay = {
  entryEpoch: number;
  exitEpoch: number | null;
  memberAcks: number[];
};

type HoldRecord = {
  suspendEpoch: number;
  resumeEpoch: number | null;
  resumeSource: string | null;
};

type LoopState = {
  currentGroup: string | null;
  memberSet: Set<string>;
  queueStays: QueueStay[];
  allHolds: HoldRecord[];
  lastSuspendEpoch: number | null;
};

function lastOpenStay(arr: QueueStay[]): QueueStay | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].exitEpoch === null) return arr[i];
  }
  return undefined;
}

function lastOpenHold(arr: HoldRecord[]): HoldRecord | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].resumeEpoch === null) return arr[i];
  }
  return undefined;
}

function handleGroupEvent(e: Event, result: Timeline, ctx: ExtractCtx, loopState: LoopState): void {
  const inQueue = (g: unknown) => g != null && nameKey(g) === nameKey(ctx.queueName);
  const wasInQueue = inQueue(e.oldValue);
  const nowInQueue = inQueue(e.newValue);

  if (nowInQueue) {
    result.assignTimeUtcIso = epochMsToUtcIso(e.atEpoch);
    result.lastQueueEntryEpoch = e.atEpoch;
    loopState.queueStays.push({ entryEpoch: e.atEpoch, exitEpoch: null, memberAcks: [] });
  } else if (wasInQueue) {
    const openStay = lastOpenStay(loopState.queueStays);
    if (openStay) openStay.exitEpoch = e.atEpoch;
    loopState.lastSuspendEpoch = null;
  }
  loopState.currentGroup = e.newValue;
}

function handleAssignmentEvent(e: Event, result: Timeline, ctx: ExtractCtx, loopState: LoopState): void {
  if (loopState.memberSet.has(nameKey(e.newValue))) {
    const openStay = lastOpenStay(loopState.queueStays);
    if (openStay) openStay.memberAcks.push(e.atEpoch);
  }
}

function handleStateEvent(e: Event, result: Timeline, ctx: ExtractCtx, loopState: LoopState): void {
  const inQueue = (g: unknown) => g != null && nameKey(g) === nameKey(ctx.queueName);
  if (!inQueue(loopState.currentGroup)) return;

  const toLabel = resolveLabel(ctx.stateMap, e.newValue).toLowerCase();
  const fromLabel = resolveLabel(ctx.stateMap, e.oldValue).toLowerCase();

  if (toLabel === "on hold" && fromLabel !== "on hold") {
    result.onHoldCount++;
    loopState.allHolds.push({ suspendEpoch: e.atEpoch, resumeEpoch: null, resumeSource: null });
    loopState.lastSuspendEpoch = e.atEpoch;
  }

  if (loopState.lastSuspendEpoch !== null && e.atEpoch > loopState.lastSuspendEpoch) {
    if (toLabel === "in progress" || toLabel === "resolved") {
      const openHold = lastOpenHold(loopState.allHolds);
      if (openHold) {
        openHold.resumeEpoch = e.atEpoch;
        openHold.resumeSource = toLabel === "in progress" ? "In Progress" : "Resolved";
      } else {
        const lastHold = loopState.allHolds[loopState.allHolds.length - 1];
        if (lastHold) {
          lastHold.resumeEpoch = e.atEpoch;
          lastHold.resumeSource = toLabel === "in progress" ? "In Progress" : "Resolved";
        }
      }
    }
  }
}

function resolveAssignAndAckTime(result: Timeline, queueStays: QueueStay[]): void {
  for (let i = queueStays.length - 1; i >= 0; i--) {
    const stay = queueStays[i];
    const validAcks = stay.memberAcks.filter(a => a >= stay.entryEpoch).sort((a, b) => a - b);
    if (validAcks.length > 0) {
      result.assignTimeUtcIso = epochMsToUtcIso(stay.entryEpoch);
      result.lastQueueEntryEpoch = stay.entryEpoch;
      result.acknTimeUtcIso = epochMsToUtcIso(validAcks[0]);
      return;
    }
  }
}

function resolveSuspendResume(result: Timeline, allHolds: HoldRecord[]): void {
  const assignEpoch = result.assignTimeUtcIso ? parseUtc(result.assignTimeUtcIso) : null;
  if (assignEpoch === null || !Number.isFinite(assignEpoch)) return;

  const valid = allHolds
    .filter(h => h.suspendEpoch > assignEpoch)
    .sort((a, b) => a.suspendEpoch - b.suspendEpoch);
  if (valid.length === 0) return;

  result.suspendTimeUtcIso = epochMsToUtcIso(valid[0].suspendEpoch);

  let lastResume: HoldRecord | null = null;
  for (const h of valid) {
    if (h.resumeEpoch !== null) lastResume = h;
  }
  if (lastResume) {
    result.resumeTimeUtcIso = epochMsToUtcIso(lastResume.resumeEpoch as number);
    result.resumeSource = lastResume.resumeSource;
  }
}

function enforceOrderingContract(result: Timeline): void {
  const assignEpoch = result.assignTimeUtcIso ? parseUtc(result.assignTimeUtcIso) : null;
  const suspendEpoch = result.suspendTimeUtcIso ? parseUtc(result.suspendTimeUtcIso) : null;
  const resumeEpoch = result.resumeTimeUtcIso ? parseUtc(result.resumeTimeUtcIso) : null;

  if (assignEpoch !== null && suspendEpoch !== null && suspendEpoch <= assignEpoch) {
    result.suspendTimeUtcIso = null;
    result.resumeTimeUtcIso = null;
    result.resumeSource = null;
  } else if (suspendEpoch !== null && resumeEpoch !== null && resumeEpoch <= suspendEpoch) {
    result.resumeTimeUtcIso = null;
    result.resumeSource = null;
  }
}

function clampAssignTime(result: Timeline, ctx: ExtractCtx): void {
  const bornEpoch = utcRawToEpochMs(ctx.openedAtUtcRaw);
  if (!Number.isFinite(bornEpoch)) return;
  const a = utcRawToEpochMs(String(result.assignTimeUtcIso || ""));
  if (Number.isFinite(a) && a < bornEpoch) {
    result.assignTimeUtcIso = epochMsToUtcIso(bornEpoch);
  }
}

function extractTimelines(auditRows: AuditRowLike[] | null | undefined, ctx: ExtractCtx): Timeline {
  const events = normalizeEvents(auditRows);
  const result = createResult();
  const memberSet = new Set((ctx.memberNames || []).map(nameKey));

  const fallback = applyBornInQueueFallback(events, result, ctx);
  const loopState: LoopState = {
    currentGroup: fallback.group,
    memberSet,
    queueStays: fallback.stays,
    allHolds: [],
    lastSuspendEpoch: null
  };

  for (const e of events) {
    if (e.field === "assignment_group") handleGroupEvent(e, result, ctx, loopState);
    else if (e.field === "assigned_to") handleAssignmentEvent(e, result, ctx, loopState);
    else if (e.field === "state") handleStateEvent(e, result, ctx, loopState);
  }

  resolveAssignAndAckTime(result, loopState.queueStays);
  resolveSuspendResume(result, loopState.allHolds);
  clampAssignTime(result, ctx);
  enforceOrderingContract(result);
  return result;
}

type SnValue = string | { display_value?: string; value?: string } | null | undefined;

function fieldValue(v: SnValue | unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return (v as { display_value?: string; value?: string }).display_value || (v as { display_value?: string; value?: string }).value || "";
  return "";
}

function rawValue(v: SnValue | unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return (v as { display_value?: string; value?: string }).value || "";
  return "";
}

function resolveStateLabel(state: SnValue | unknown, stateMap: Record<string, string>): string {
  const display = fieldValue(state);
  const raw = rawValue(state);
  if (display && display !== raw) return display;
  return stateMap[raw] || display || raw;
}

export type AnalyzedRow = {
  sysId: string | null;
  number: string;
  requestItem: string;
  shortDescription: string;
  state: string;
  stateValue: string;
  priority: string;
  priorityValue: string;
  category: string;
  caller: string;
  assignmentGroup: string;
  assignedTo: string;
  assignedToSysId: string;
  updatedOn: string;
  updatedBy: string;
  configItem: string;
  createdOn: string;
  incidentState: string;
  resolvedAt: string;
  resolvedAtRaw: string;
  openedAt: string;
  openedAtRaw: string;
  closedAt: string;
  closedAtRaw: string;
  closeCode: string;
  closeNotes: string;
  workNotes: string;
  comments: string;
  assignTimeUtcIso: string;
  acknTimeUtcIso: string;
  suspendTimeUtcIso: string;
  resumeTimeUtcIso: string;
  resumeSource: string;
  onHoldCount: number;
  activity: Array<{ f: string | undefined; o: string; n: string; atEpoch: number }>;
};

export type AnalyzeResult = { rows: AnalyzedRow[]; missingAudit: number };

export type QueueCtx = {
  membersByQueue?: Record<string, string[]>;
  fallbackMembers?: string[];
  tableName?: string;
};

function analyzeAll(
  records: Array<Record<string, unknown>>,
  auditByTicket: Record<string, unknown>,
  stateMap: Record<string, string>,
  queueCtx: QueueCtx | null | undefined
): AnalyzeResult {
  const membersByQueue = (queueCtx && queueCtx.membersByQueue) || {};
  const fallbackMembers = (queueCtx && queueCtx.fallbackMembers) || [];
  const tableName = (queueCtx && queueCtx.tableName) || "";
  const isIncident = tableName === "incident";
  const stateField = tableName === "problem" ? "problem_state" : "state";
  const out: AnalyzedRow[] = [];
  let missingAudit = 0;
  for (const rec of records) {
    const snapshotGroupName = fieldValue(rec.assignment_group);
    const sysIdRec = rec.sys_id as { value?: string; display_value?: string } | null | undefined;
    const sysId = typeof rec.sys_id === "object" && sysIdRec
      ? (sysIdRec.value || sysIdRec.display_value)
      : rec.sys_id;
    const sysIdStr = typeof sysId === "string" ? sysId : null;
    const rows = sysIdStr ? (auditByTicket[sysIdStr] as AuditRowLike[] | undefined) : undefined;
    if (!rows) missingAudit++;
    const t = extractTimelines(rows, {
      stateMap,
      queueName: nameKey(snapshotGroupName),
      memberNames: membersByQueue[nameKey(snapshotGroupName)] || fallbackMembers,
      snapshotGroupName,
      openedAtUtcRaw: rawValue(rec.opened_at)
    });
    const stateLabel = fieldValue(rec[stateField]).toLowerCase();
    if (!isIncident) {
      t.suspendTimeUtcIso = null;
      t.resumeTimeUtcIso = null;
      t.resumeSource = null;
    } else if (!stateLabel.startsWith("close") && !stateLabel.startsWith("resolv")) {
      t.suspendTimeUtcIso = null;
      t.resumeTimeUtcIso = null;
      t.resumeSource = null;
    }
    const activity = (rows || [])
      .map(r => {
        const ms = parseUtc(r.at);
        return {
          f: r.field,
          o: String(r.oldValue ?? ""),
          n: String(r.newValue ?? ""),
          atEpoch: Number.isFinite(ms) ? ms : null
        };
      })
      .filter(e => e.atEpoch !== null)
      .map(e => ({ f: e.f, o: e.o, n: e.n, atEpoch: e.atEpoch as number }))
      .sort((a, b) => b.atEpoch - a.atEpoch)
      .slice(0, 500);
    out.push({
      sysId: sysIdStr,
      number: fieldValue(rec.number),
      requestItem: fieldValue((rec as Record<string, unknown>)["request_item.number"]),
      shortDescription: fieldValue(rec.short_description),
      state: resolveStateLabel(rec[stateField], stateMap),
      stateValue: rawValue(rec[stateField]),
      priority: fieldValue(rec.u_priority ?? rec.priority),
      priorityValue: rawValue(rec.u_priority ?? rec.priority),
      category: fieldValue(rec.category),
      caller: fieldValue(rec.caller_id),
      assignmentGroup: fieldValue(rec.assignment_group),
      assignedTo: fieldValue(rec.assigned_to),
      assignedToSysId: rawValue(rec.assigned_to),
      updatedOn: fieldValue(rec.sys_updated_on),
      updatedBy: fieldValue(rec.sys_updated_by),
      configItem: fieldValue(rec.cmdb_ci),
      createdOn: fieldValue(rec.sys_created_on),
      incidentState: fieldValue(rec.incident_state),
      resolvedAt: fieldValue(rec.resolved_at),
      resolvedAtRaw: rawValue(rec.resolved_at),
      openedAt: fieldValue(rec.opened_at),
      openedAtRaw: rawValue(rec.opened_at),
      closedAt: fieldValue(rec.closed_at),
      closedAtRaw: rawValue(rec.closed_at),
      closeCode: fieldValue(rec.close_code),
      closeNotes: fieldValue(rec.close_notes),
      workNotes: fieldValue(rec.work_notes),
      comments: fieldValue(rec.comments),
      assignTimeUtcIso: t.assignTimeUtcIso || "",
      acknTimeUtcIso: t.acknTimeUtcIso || "",
      suspendTimeUtcIso: t.suspendTimeUtcIso || "",
      resumeTimeUtcIso: t.resumeTimeUtcIso || "",
      resumeSource: t.resumeSource || "",
      onHoldCount: t.onHoldCount,
      activity
    });
  }
  return { rows: out, missingAudit };
}

const ACTIVITY_ANCHORS = [
  { field: "assignment_group", labels: ["assignment group"] },
  { field: "assigned_to", labels: ["assigned to"] },
  { field: "state", labels: ["state", "incident state"] }
];

const ACTIVITY_DT_RE = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\/\d{1,2}\/\d{4})[ T](\d{1,2}:\d{2}(?::\d{2})?)\s*([AaPp][Mm])?/g;

function scanSnDateTime(text: unknown): string {
  const re = new RegExp(ACTIVITY_DT_RE.source, "g");
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const ms = parseSnDisplayMs(`${m[1]} ${m[2]}${m[3] ? " " + m[3] : ""}`);
    if (ms != null && Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return "";
}

function cleanCapture(s: unknown): string {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\\+/g, "")
    .replace(/^["'\s]+|["'\s,.;]+$/g, "")
    .trim();
}

type ActivityChange = {
  field: string;
  oldValue: string;
  newValue: string;
  at: string;
};

function extractEventsFromActivity(entries: unknown[]): ActivityChange[] {
  const out: ActivityChange[] = [];
  const seen = new Set<string>();
  for (const entry of entries || []) {
    if (!entry || typeof entry !== "object") continue;

    const changes = Array.isArray((entry as { changes?: unknown }).changes) ? (entry as { changes: unknown[] }).changes : null;
    if (changes) {
      for (const ch of changes) {
        if (!ch || typeof ch !== "object") continue;
        const c = ch as Record<string, unknown>;
        const label = String(c.label ?? c.field_label ?? "").toLowerCase();
        const anchor = ACTIVITY_ANCHORS.find(a => a.labels.some(l => label === l));
        if (!anchor) continue;
        const atIso = scanSnDateTime(JSON.stringify(ch)) ||
          scanSnDateTime(JSON.stringify(entry));
        const ev = {
          field: anchor.field,
          oldValue: cleanCapture(c.old_value ?? c.old ?? c.from ?? ""),
          newValue: cleanCapture(c.new_value ?? c.new ?? c.to ?? ""),
          at: atIso
        };
        const key = `${ev.field}|${ev.oldValue}|${ev.newValue}|${ev.at}`;
        if (ev.at && !seen.has(key)) {
          seen.add(key);
          out.push(ev);
        }
      }
      continue;
    }

    const text = JSON.stringify(entry);
    if (!text) continue;
    const low = text.toLowerCase();
    for (const anchor of ACTIVITY_ANCHORS) {
      for (const label of anchor.labels) {
        const idx = low.indexOf(label);
        if (idx === -1) continue;
        const window = text.slice(idx, idx + 200);
        const m = window.match(new RegExp(
          label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[^a-z]{0,3}changed from (.+?) to (.+?)(?=\\s+on\\s+[\\d<\"]|<|,|\\}|$)",
          "i"
        ));
        if (!m) continue;
        const atIso = scanSnDateTime(window);
        if (!atIso) break;
        const ev = {
          field: anchor.field,
          oldValue: cleanCapture(m[1]),
          newValue: cleanCapture(m[2]),
          at: atIso
        };
        const key = `${ev.field}|${ev.oldValue}|${ev.newValue}|${ev.at}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(ev);
        }
        break;
      }
    }
  }
  return out;
}

type ListHistoryRow = ActivityChange & { at: string };

type ListHistoryEntry = {
  document_id?: unknown;
  sys_created_on?: unknown;
  entries?: { changes?: Array<Record<string, unknown>> };
};

function extractEventsFromListHistory(payload: { entries?: unknown[] } | null | undefined): Record<string, ListHistoryRow[]> {
  const byTicket: Record<string, ListHistoryRow[]> = {};
  for (const e of payload?.entries || []) {
    const entry = e as ListHistoryEntry;
    if (!entry || typeof entry !== "object") continue;
    const docId = String(entry.document_id || "").trim();
    if (!docId) continue;
    const at = String(entry.sys_created_on || "").trim();
    if (!at) continue;
    for (const ch of (entry.entries?.changes || [])) {
      if (!ch || typeof ch !== "object") continue;
      let fname = String(ch.field_name || "").trim();
      if (!fname) continue;
      if (fname === "incident_state" || fname === "problem_state") fname = "state";
      (byTicket[docId] ||= []).push({
        field: fname,
        oldValue: String(ch.old_value ?? ch.sanitized_old_value ?? ""),
        newValue: String(ch.new_value ?? ch.sanitized_new_value ?? ""),
        at
      });
    }
  }
  return byTicket;
}

export { extractTimelines, analyzeAll, extractEventsFromActivity, extractEventsFromListHistory };