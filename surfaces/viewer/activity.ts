import * as Journal from "../../core/journal.ts";
import { rowOffsetMs } from "../../core/sntime.ts";
import { parseSnDisplayMs } from "../../core/sntime.ts";
import { el } from "./core.ts";
import type { ViewerRow } from "./core.ts";
import { fmtInstant } from "./grid.ts";
import { setTip } from "../../lib/tooltip.ts";

type FieldEntry = { label: string; cls: string; author: string; time: string; sort?: string; text: string };
type FieldChangeEv = { atEpoch?: unknown; f?: unknown; o?: unknown; n?: unknown };

const FIELD_LABELS: Record<string, string> = {
  assignment_group: "Assignment group",
  assigned_to: "Assigned to",
  state: "State",
  incident_state: "State",
  priority: "Priority",
  impact: "Impact",
  urgency: "Urgency",
  severity: "Severity",
  close_code: "Close code",
  contact_type: "Contact type",
  category: "Category",
  subcategory: "Subcategory",
  cmdb_ci: "Configuration item",
  escalation: "Escalation",
  resolved_by: "Resolved by",
  email: "Email"
};

function fieldLabel(f: unknown): string {
  const k = String(f || "").toLowerCase();
  return FIELD_LABELS[k] ||
    String(f || "").replace(/u002e/g, ".").split(/[._]/).filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Change";
}

function fieldChangeEntries(row: ViewerRow): FieldEntry[] {
  return (row.activity || []).map((ev: FieldChangeEv) => {
    const iso = Number.isFinite(ev.atEpoch as number) && ev.atEpoch !== null
      ? new Date(ev.atEpoch as number).toISOString() : "";
    return {
      label: "Field change",
      cls: "fc",
      author: "",
      time: iso ? fmtInstant(iso, row) : "",
      sort: Number.isFinite(ev.atEpoch as number) ? new Date(ev.atEpoch as number).toISOString().replace("T", " ").slice(0, 19) : "",
      text: `${fieldLabel(ev.f)}: ${ev.o || "(empty)"} → ${ev.n || "(empty)"}`
    };
  });
}

function activityPaneEl(row: ViewerRow): HTMLElement {
  const wrap = el("div", "msrPickNotes");
  const head = el("div", "msrPickNotesHead");
  const body = el("div", "msrPickNotesBody");
  const journal = Journal.build(row);
  const pinned: FieldEntry[] = [];
  const summary = String(row.shortDescription || "").trim();
  if (summary) pinned.push({ label: "Summary", cls: "sum", time: "", author: "", text: summary });
  // Only Work notes (wn) and Resolution notes (rn) — drop customer comments and
  // field-change entries to keep the pane focused and compact.
  const stream: FieldEntry[] = (journal as FieldEntry[])
    .filter((e) => (e as { cls?: string }).cls === "wn" || (e as { cls?: string }).cls === "rn")
    .sort((a, b) => Journal.sortKey(b as Journal.Entry).localeCompare(Journal.sortKey(a as Journal.Entry)));
  head.textContent = `${row.number || ""} · Notes · ${pinned.length + stream.length} ${pinned.length + stream.length === 1 ? "entry" : "entries"}`;
  if (!stream.length && !pinned.length) {
    const d = el("div", "noteEmpty");
    d.textContent = "No work notes or resolution notes on this ticket.";
    body.appendChild(d);
  }
  const renderPinnedCard = (n: FieldEntry): void => {
    const item = el("div", `noteItem ${n.cls}`);
    const meta = el("div", "noteMeta");
    const lab = el("span", "noteLabel");
    lab.textContent = n.label;
    meta.append(lab);
    const bd = el("div", "noteBody");
    bd.textContent = n.text;
    item.append(meta, bd);
    body.appendChild(item);
  };
  const renderEntryBlock = (n: FieldEntry): HTMLElement => {
    const wrapE = el("div", `noteEntry ${n.cls}`);
    const sub = el("div", "noteSub");
    const lab = el("span", "noteLabel");
    lab.textContent = n.label;
    sub.append(lab);
    if (n.time) {
      const dot = el("span", "noteDot");
      dot.textContent = "•";
      const tm = el("span", "noteTime");
      tm.textContent = n.time;
      sub.append(dot, tm);
    }
    const bd = el("div", "noteBody");
    bd.textContent = n.text;
    wrapE.append(sub, bd);
    return wrapE;
  };
  for (const p of pinned) renderPinnedCard(p);
  for (const g of Journal.group(stream as unknown as Journal.JournalItem[])) {
    const card = el("div", "noteGroup");
    const author = Journal.cleanAuthor(g.author);
    if (author) {
      const meta = el("div", "noteMeta");
      const av = el("span", "noteAvatar");
      av.textContent = Journal.authorInitials(author);
      setTip(av, author);
      const an = el("span", "noteAuthor");
      an.textContent = author;
      meta.append(av, an);
      card.appendChild(meta);
    }
    for (const n of g.items) card.appendChild(renderEntryBlock(n as unknown as FieldEntry));
    body.appendChild(card);
  }
  wrap.append(head, body);
  return wrap;
}

type TimelineItem = {
  epoch: number;
  time: string;
  kind: "wn" | "rn" | "cm" | "fc";
  label: string;
  author: string;
  text: string;
  moments: string[];
};

const KEY_MOMENTS: Array<{ key: string; label: string }> = [
  { key: "assignTimeUtcIso", label: "Assign time" },
  { key: "acknTimeUtcIso", label: "Ackn time" },
  { key: "suspendTimeUtcIso", label: "Suspend time" },
  { key: "resumeTimeUtcIso", label: "Resume time" }
];

/** Parse a note heading / resolved date (instance wall clock) to a comparable
 *  epoch so notes order against field changes. Handles yyyy-MM-dd and
 *  dd-MM-yyyy display formats. */
function headingToEpoch(s: unknown): number {
  const ms = parseSnDisplayMs(String(s || ""));
  return ms == null ? NaN : ms;
}

type NoteEntry = { time: string; author: string; text: string };

/** A line that starts a note entry: a datetime (yyyy-MM-dd or dd-MM-yyyy, with
 *  optional AM/PM) optionally followed by " - Author (Journal type)". */
const NOTE_HEAD_RE =
  /^((?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\s*(?:-\s*(.*))?$/;

/** Split a ServiceNow journal blob into individual dated entries, tolerant of
 *  both date orders. Falls back to a single undated entry when no heading is
 *  recognised (so the text is never dropped). */
function splitNoteBlob(blob: unknown): NoteEntry[] {
  const txt = String(blob || "").replace(/\r\n/g, "\n").trim();
  if (!txt) return [];
  const out: NoteEntry[] = [];
  let cur: NoteEntry | null = null;
  const body: string[] = [];
  const flush = (): void => {
    if (cur) { cur.text = body.join("\n").trim(); if (cur.text) out.push(cur); }
    body.length = 0;
  };
  for (const ln of txt.split("\n")) {
    const m = ln.match(NOTE_HEAD_RE);
    if (m) {
      flush();
      const author = (m[2] || "").replace(/\((?:Work notes?|Additional comments?|Comments?)\)/i, "").trim();
      cur = { time: m[1].trim(), author, text: "" };
    } else if (cur) {
      body.push(ln);
    } else {
      cur = { time: "", author: "", text: "" };
      body.push(ln);
    }
  }
  flush();
  return out;
}

/**
 * Merge a row's work/resolution/customer notes and its field-change activity
 * into one chronological (oldest-first) list, marking the entries that produced
 * each derived key moment (assign/ackn/suspend/resume time). Pure: no DOM.
 */
function buildTimeline(row: ViewerRow): TimelineItem[] {
  const items: TimelineItem[] = [];
  // Field-change atEpoch is true UTC; note headings are instance wall-clock
  // parsed as UTC. Shift the field epochs by the row's offset so BOTH sit on the
  // same wall-clock frame and interleave chronologically. Display still uses the
  // real UTC time via fmtInstant.
  const offset = rowOffsetMs(row as { openedAt?: string; openedAtRaw?: string }, 0);

  for (const ev of (row.activity || []) as FieldChangeEv[]) {
    const real = Number.isFinite(ev.atEpoch as number) ? Number(ev.atEpoch) : NaN;
    items.push({
      epoch: Number.isFinite(real) ? real + offset : NaN,
      time: Number.isFinite(real) ? new Date(real).toISOString() : "",
      kind: "fc",
      label: fieldLabel(ev.f),
      author: "",
      text: `${ev.o || "(empty)"} \u2192 ${ev.n || "(empty)"}`,
      moments: []
    });
  }

  const pushNote = (kind: TimelineItem["kind"], label: string, text: string, heading: string, author: string): void => {
    const epoch = headingToEpoch(heading);
    items.push({ epoch, time: heading || "", kind, label, author: author || "", text, moments: [] });
  };

  for (const e of splitNoteBlob(row.workNotes)) pushNote("wn", "Work note", e.text, e.time, e.author);
  for (const e of splitNoteBlob(row.comments)) pushNote("cm", "Comment", e.text, e.time, e.author);
  const closeNotes = String(row.closeNotes || "").trim();
  if (closeNotes) {
    pushNote("rn", "Resolution", closeNotes, String(row.resolvedAt || ""), "");
  }

  // Mark the entry closest to each derived key moment (within 1 minute). Compare
  // in the same wall-clock frame: derived times are UTC ISO -> shift by offset.
  for (const km of KEY_MOMENTS) {
    const real = new Date(String(row[km.key] || "")).getTime();
    if (!Number.isFinite(real)) continue;
    const t = real + offset;
    let best = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < items.length; i++) {
      if (!Number.isFinite(items[i].epoch)) continue;
      const d = Math.abs(items[i].epoch - t);
      if (d < bestDelta) { bestDelta = d; best = i; }
    }
    if (best >= 0 && bestDelta <= 60_000) items[best].moments.push(km.label);
  }

  items.sort((a, b) => {
    const ad = Number.isFinite(a.epoch);
    const bd = Number.isFinite(b.epoch);
    if (ad && bd) return b.epoch - a.epoch;
    if (ad) return -1;
    if (bd) return 1;
    return 0;
  });
  return items;
}

type TimelineGroup = {
  epoch: number;
  time: string;
  items: TimelineItem[];
  moments: string[];
};

/** Bucket a sorted timeline into cards. Only consecutive FIELD CHANGES that
 *  share a timestamp (minute precision) merge into one card; work notes,
 *  customer comments and resolution/close notes are always standalone cards.
 *  Unions each field-change bucket's key-moment labels. Pure: no DOM. */
function groupTimeline(items: TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const minute = (it: TimelineItem): string =>
    Number.isFinite(it.epoch) ? String(Math.floor(it.epoch / 60_000)) : "nd";
  let cur: TimelineGroup | null = null;
  let curKey = "";
  for (const it of items) {
    if (it.kind !== "fc") {
      cur = null;
      curKey = "";
      groups.push({ epoch: it.epoch, time: it.time, items: [it], moments: [...it.moments] });
      continue;
    }
    const k = `fc:${minute(it)}`;
    if (!cur || k !== curKey) {
      cur = { epoch: it.epoch, time: it.time, items: [it], moments: [...it.moments] };
      curKey = k;
      groups.push(cur);
    } else {
      cur.items.push(it);
      for (const m of it.moments) if (!cur.moments.includes(m)) cur.moments.push(m);
    }
  }
  return groups;
}

/** Icon-less short tag for an entry kind, shown as the sub-event label prefix. */
function kindTag(kind: TimelineItem["kind"]): string {
  switch (kind) {
    case "wn": return "Work note";
    case "rn": return "Resolution";
    case "cm": return "Comment";
    default: return "Change";
  }
}

/**
 * Full chronological timeline pane (work notes + resolution + field changes),
 * with derived key moments highlighted. Used by the column editor's left side.
 */
function timelinePaneEl(row: ViewerRow): HTMLElement {
  const wrap = el("div", "msrPickNotes ce-timeline");
  const head = el("div", "msrPickNotesHead");
  const body = el("div", "msrPickNotesBody");
  const items = buildTimeline(row);
  const summary = String(row.shortDescription || "").trim();
  head.textContent = `${row.number || ""} \u00b7 Timeline \u00b7 ${items.length} ${items.length === 1 ? "event" : "events"}`;

  if (summary) {
    const item = el("div", "noteItem sum");
    const meta = el("div", "noteMeta");
    const lab = el("span", "noteLabel");
    lab.textContent = "Summary";
    meta.append(lab);
    const bd = el("div", "noteBody");
    bd.textContent = summary;
    item.append(meta, bd);
    body.appendChild(item);
  }

  if (!items.length) {
    const d = el("div", "noteEmpty");
    d.textContent = "No timeline events on this ticket.";
    body.appendChild(d);
  }

  for (const g of groupTimeline(items)) {
    const card = el("div", `tlCard${g.moments.length ? " tlMoment" : ""}`);
    const cardHead = el("div", "tlCardHead");
    if (g.time) {
      const tm = el("span", "tlCardTime");
      const first = g.items[0];
      tm.textContent = first.kind === "fc" ? fmtInstant(first.time, row) : first.time;
      cardHead.append(tm);
    }
    for (const m of g.moments) {
      const chip = el("span", "tlMomentChip");
      chip.textContent = m;
      cardHead.append(chip);
    }
    card.appendChild(cardHead);

    for (const it of g.items) {
      const line = el("div", `tlLine ${it.kind}`);
      const lab = el("span", "tlLineLabel");
      lab.textContent = it.kind === "fc" ? it.label : kindTag(it.kind);
      line.append(lab);
      const author = Journal.cleanAuthor(it.author);
      if (author) {
        const an = el("span", "noteAuthor");
        an.textContent = author;
        line.append(an);
      }
      const bd = el("div", "noteBody");
      bd.textContent = it.kind === "fc" ? `${it.label}: ${it.text}` : it.text;
      line.append(bd);
      card.appendChild(line);
    }
    body.appendChild(card);
  }

  wrap.append(head, body);
  return wrap;
}

export {
  fieldLabel,
  fieldChangeEntries,
  activityPaneEl,
  buildTimeline,
  groupTimeline,
  timelinePaneEl,
  FIELD_LABELS
};