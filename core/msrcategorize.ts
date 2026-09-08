/**
 * Deterministic classifier that maps free text onto a fixed list of candidate
 * labels — used to turn parsed resolution/closure notes into MSR option-list
 * values for `rootCause` (per ticket type) and `solutionType` (resolution).
 *
 * Pure: no I/O, no DOM, no chrome.*. Standalone in plain node, like the other
 * `core/` modules. The optional ML path lives behind this same interface in a
 * service layer; here we ship the always-available, offline scorer.
 *
 * Scoring is a weighted keyword/hint match per candidate label, summed over
 * every hint that occurs in a token-normalised form of the text. Fuzzy token
 * matching (bounded edit distance) absorbs misspellings ("permanant",
 * "workarround"), and the confidence is derived from the margin between the
 * best and second-best label, so ties collapse to null rather than guessing.
 */

import { DEFAULT_HINTS } from "./msrchoices.ts";
import { findLabeledValue } from "./aiextract.ts";
import type { SectionKey } from "./aiextract.ts";

export type MsrScore = {
  /** Best-matching candidate label, or null when nothing clears the bar. */
  label: string | null;
  /** 0..1 confidence. 0 means "no evidence at all". */
  confidence: number;
  /** Which stage of the cascade produced the label. */
  level: "regex" | "keyword" | "cosine" | null;
  /** Per-label totals, for diagnostics. */
  scores: Record<string, number>;
};

export type ClassifyMsrOptions = {
  /** Minimum total score before a label can win at all. */
  minScore?: number;
  /** Minimum winning confidence (0..1). Below this, we return null. */
  minConfidence?: number;
  /** Override/augment hint phrases per label (keyed by normalised label). When a
   *  label has an override it is used as-is (authoritative) over the defaults. */
  hints?: Record<string, string[]>;
  /** Override/augment regex patterns per label (authoritative over defaults). */
  regex?: Record<string, RegExp[]>;
  /** Allow the first (exact regex) stage. Turn off to rely on keyword/cosine. */
  useRegex?: boolean;
  /** Weight of the TF-IDF cosine term relative to the keyword hint count. */
  cosineWeight?: number;
};

const COSINE_WEIGHT = 2;
const KEYWORD_MIN_HITS = 2;
const COS_MIN = 0.15;
const COS_MARGIN = 0.05;

const DEFAULTS: Required<ClassifyMsrOptions> = {
  minScore: 1,
  minConfidence: 0.32,
  hints: {},
  regex: {},
  useRegex: true,
  cosineWeight: COSINE_WEIGHT
};

/** Token-normalise: lowercase, strip punctuation, collapse whitespace. */
function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const n = norm(s);
  return n ? n.split(" ") : [];
}

/** Words that negate a following cue. `norm`/`tokens` strip apostrophes, so the
 *  contracted forms appear as "isnt"/"wasnt"/"cant" etc. after tokenising. */
const NEGATORS = new Set([
  "no", "not", "never", "without", "none", "cannot", "cant", "dont", "doesnt",
  "didnt", "wont", "isnt", "wasnt", "arent", "werent", "neither", "nor"
]);

const NEG_WINDOW = 3;

/** True when any of the up-to-NEG_WINDOW tokens before index `i` is a negator. */
function negatedAt(textTokens: string[], i: number): boolean {
  for (let k = 1; k <= NEG_WINDOW; k++) {
    const idx = i - k;
    if (idx < 0) break;
    if (NEGATORS.has(textTokens[idx])) return true;
  }
  return false;
}

/**
 * Bounded edit distance that bails out early: used to accept a hint token when
 * the note only has it misspelled. The tolerated distance grows with the
 * shorter token's length so common short words never cross-match ("wan" must
 * not match "was"), while genuine misspellings ("permanant", "workarround")
 * still pass.
 */
function within(a: string, b: string): boolean {
  if (a === b) return true;
  const short = Math.min(a.length, b.length);
  let max: number;
  if (short < 5) max = 0;         // short words: exact only
  else if (short < 8) max = 1;
  else max = 2;
  if (max === 0) return false;
  if (Math.abs(a.length - b.length) > max) return false;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n] <= max;
}

/** Non-zero only when `phrase` (a full hint, possibly multi-token) is present
 *  AND not negated by a preceding word. */
function phraseScore(textTokens: string[], phrase: string): number {
  const words = tokens(phrase);
  if (!words.length) return 0;
  for (let i = 0; i + words.length <= textTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < words.length; j++) {
      if (!within(textTokens[i + j], words[j])) {
        ok = false;
        break;
      }
    }
    if (ok && !negatedAt(textTokens, i)) return 1;
  }
  return 0;
}

/** The expanded token set for one label document: the label text plus each of
 *  its hint phrases, so TF-IDF scores share the same synonym vocabulary as the
 *  keyword pass. */
function docTokens(label: string, hints: string[]): string[] {
  const out = tokens(label);
  for (const hint of hints) out.push(...tokens(hint));
  return out;
}

/** Specificity of a matched pattern: word count first, then character length,
 *  packed so word count dominates. Longer / multi-word patterns are stronger. */
function patternSpecificity(matched: string): number {
  const words = norm(matched).split(" ").filter(Boolean).length;
  return words * 1000 + matched.length;
}

/** Runs one regex over the body counting only NON-negated matches, and tracks
 *  the highest specificity among them. Returns {count, spec}. */
function regexMatchInfo(re: RegExp, body: string): { count: number; spec: number } {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let count = 0;
  let spec = 0;
  let m: RegExpExecArray | null;
  while ((m = g.exec(body)) !== null) {
    if (m.index === g.lastIndex) g.lastIndex++;
    const before = tokens(body.slice(0, m.index));
    if (NEGATORS.has(before[before.length - 1]) ||
        NEGATORS.has(before[before.length - 2]) ||
        NEGATORS.has(before[before.length - 3])) {
      continue;
    }
    count++;
    const s = patternSpecificity(m[0]);
    if (s > spec) spec = s;
  }
  return { count, spec };
}

function vectorMagnitude(v: Map<string, number>): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

/**
 * TF-IDF cosine between the note and each label document. Terms that appear in
 * no label document carry no evidence and are ignored; terms shared across many
 * labels (e.g. "issue", "error") are down-weighted so distinctive vocabulary
 * dominates. Returns one [0,1] value per label, in the same order as `docs`.
 */
function cosineScores(note: string[], docs: string[][]): number[] {
  const N = docs.length;
  if (!N) return [];
  if (!note.length) return docs.map(() => 0);

  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + N / d));
  const weight = (t: string): number => idf.get(t) || 0;

  const noteVec = new Map<string, number>();
  for (const t of note) {
    const w = weight(t);
    if (w > 0) noteVec.set(t, (noteVec.get(t) || 0) + w);
  }
  const noteMag = vectorMagnitude(noteVec);
  if (noteMag === 0) return docs.map(() => 0);

  const docVecs = docs.map((doc) => {
    const v = new Map<string, number>();
    for (const t of doc) {
      const w = weight(t);
      if (w > 0) v.set(t, (v.get(t) || 0) + w);
    }
    return v;
  });

  return docVecs.map((dv) => {
    const docMag = vectorMagnitude(dv);
    if (docMag === 0) return 0;
    let dot = 0;
    for (const [t, v] of noteVec) {
      const d = dv.get(t);
      if (d) dot += v * d;
    }
    return dot / (noteMag * docMag);
  });
}

/**
 * Scores `text` against the candidate labels as a three-stage cascade:
 *   1. regex  — exact word-boundary patterns over the whole note (any match wins).
 *   2. keywork — fuzzy hint-phrase hit-count (best >= 2 and > runner-up).
 *   3. cosine — TF-IDF cosine of the note vs each label's hint document.
 * The first stage with a clear winner decides; otherwise the label is null and
 * the caller may fall back to ML.
 */
export function classifyMsr(
  text: unknown,
  candidateLabels: string[],
  opts: ClassifyMsrOptions = {}
): MsrScore {
  const o = { ...DEFAULTS, ...opts, hints: opts.hints || {}, regex: opts.regex || {} };
  const body = String(text ?? "").trim();
  const textTokens = tokens(body);

  // Cosine sees the note with negated tokens removed, so a negated cue cannot
  // lift the wrong label's similarity. Regex/keyword do their own negation check
  // against the full text.
  const cosineTokens = textTokens.filter((_t, i) => !negatedAt(textTokens, i));

  const hintsByLabel = new Map<string, string[]>();
  const docs: string[][] = [];
  const regexByLabel = new Map<string, RegExp[]>();
  for (const label of candidateLabels) {
    const hints = hintPairs(label, o.hints);
    hintsByLabel.set(label, hints);
    docs.push(docTokens(label, hints));
    regexByLabel.set(label, o.useRegex ? regexPairs(label, o.regex) : []);
  }
  const cos = cosineScores(cosineTokens, docs);

  const hits: Record<string, number> = {};
  const regexHits: Record<string, number> = {};
  const regexSpec: Record<string, number> = {};
  candidateLabels.forEach((label) => {
    let h = 0;
    for (const hint of hintsByLabel.get(label)!) h += phraseScore(textTokens, hint);
    hits[label] = h;
    let rh = 0;
    let rs = 0;
    for (const re of regexByLabel.get(label)!) {
      const info = regexMatchInfo(re, body);
      if (info.count > 0) {
        rh += info.count;
        if (info.spec > rs) rs = info.spec;
      }
    }
    regexHits[label] = rh;
    regexSpec[label] = rs;
  });

  // Combined scores (kept for the confidence formula / diagnostics).
  const scores: Record<string, number> = {};
  candidateLabels.forEach((label, i) => { scores[label] = hits[label] + o.cosineWeight * cos[i]; });

  const winner = pickCascade(regexHits, regexSpec, hits, cos, candidateLabels);

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestLabel, bestScore] = ranked[0] ?? [null, 0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (!winner || !bestLabel || bestScore < o.minScore) {
    return { label: null, confidence: 0, scores, level: null };
  }

  const margin = bestScore - secondScore;
  let confidence = Math.min(1, bestScore * 0.2 + margin * 0.18);
  confidence = Math.round(confidence * 100) / 100;

  if (confidence < o.minConfidence) {
    return { label: null, confidence: 0, scores, level: null };
  }

  return { label: winner, confidence, scores, level: levelOf(winner, regexHits, hits, cos, candidateLabels) };
}

/** Decides the winning label by stage priority. */
function pickCascade(
  regexHits: Record<string, number>,
  regexSpec: Record<string, number>,
  hits: Record<string, number>,
  cos: number[],
  candidateLabels: string[]
): string | null {
  // Regex stage: among labels with >=1 non-negated match, rank by most-specific
  // matched pattern, then hit count, then candidate order. A winner needs a
  // strict lead on (specificity, count) over the runner-up; a genuine tie falls
  // through to the keyword/cosine stages rather than guessing.
  const withHits = candidateLabels
    .map((label, idx) => ({ label, idx, count: regexHits[label] || 0, spec: regexSpec[label] || 0 }))
    .filter((e) => e.count >= 1)
    .sort((a, b) => (b.spec - a.spec) || (b.count - a.count) || (a.idx - b.idx));
  if (withHits.length) {
    const top = withHits[0];
    const next = withHits[1];
    if (!next || top.spec > next.spec || top.count > next.count) return top.label;
  }

  const kh = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  if (kh[0] && kh[0][1] >= KEYWORD_MIN_HITS && (!kh[1] || kh[0][1] > kh[1][1])) return kh[0][0];

  const cosArr = cos.map((v, i) => ({ label: candidateLabels[i], v })).sort((a, b) => b.v - a.v);
  if (cosArr[0] && cosArr[0].v >= COS_MIN && (!cosArr[1] || cosArr[0].v - cosArr[1].v >= COS_MARGIN)) {
    return cosArr[0].label;
  }
  return null;
}

function levelOf(label: string, regexHits: Record<string, number>, hits: Record<string, number>, cos: number[], candidateLabels: string[]): "regex" | "keyword" | "cosine" {
  if (regexHits[label] >= 1) return "regex";
  if (hits[label] >= KEYWORD_MIN_HITS) return "keyword";
  return "cosine";
}

/**
 * Returns the hint phrases for a label. A user override for the label is
 * authoritative; otherwise the built-in `DEFAULT_HINTS` are used. The MSR
 * option list itself supplies the candidate *labels*, not their hints.
 */
function hintPairs(label: string, overrides: Record<string, string[]> | undefined): string[] {
  const key = normalizedKey(label);
  const has = !!overrides && (Object.prototype.hasOwnProperty.call(overrides, key) || Object.prototype.hasOwnProperty.call(overrides, label));
  if (has) return (overrides![key] || overrides![label] || []).filter((h) => typeof h === "string" && h.trim());
  return (DEFAULT_HINTS[key] || []).slice();
}

/** Returns the curated regex patterns for a label (an override is authoritative). */
function regexPairs(label: string, overrides: Record<string, RegExp[]> | undefined): RegExp[] {
  const key = normalizedKey(label);
  const has = !!overrides && (Object.prototype.hasOwnProperty.call(overrides, key) || Object.prototype.hasOwnProperty.call(overrides, label));
  if (has) return (overrides![key] || overrides![label] || []).slice();
  return (BUILTIN_REGEX[key] || []).slice();
}

function normalizedKey(label: string): string {
  return norm(label);
}

/**
 * Curated, exact word-boundary regexes per normalised label — the authoritative
 * first stage. Matches must be exact phrasing (case-insensitive); misspellings
 * and paraphrases fall through to the keyword / cosine stages.
 */
const BUILTIN_REGEX: Record<string, RegExp[]> = {
  "application bug": [/code defect/i, /code bug/i, /software defect/i, /application bug/i],
  "application performance": [/slow application/i, /performance issue/i, /application performance/i],
  "database performance": [/slow database/i, /sql performance/i, /query performance/i, /database performance/i, /db slowness/i],
  "server performance": [/server slow/i, /high cpu/i, /memory leak/i, /out of memory/i, /server performance/i],
  hardware: [/hard drive/i, /disk failure/i, /memory module/i, /power supply/i, /hardware/i],
  environment: [/power issue/i, /data cent(?:er|re)/i, /air conditioning/i, /environmental/i, /environment/i],
  "interface data error": [/interface data/i, /data error/i, /feed failure/i, /mapping error/i, /data mismatch/i, /stream issue/i],
  "interfacing application error": [/interfacing application/i, /interface error/i, /upstream application/i, /downstream application/i, /connected application/i],
  "network issue": [/network/i, /connectivity/i, /packet loss/i, /latency/i, /connection issue/i],
  firewall: [/firewall/i, /blocked port/i, /port blocked/i],
  "certificate expiry": [/certificate expired/i, /certificate expiry/i, /expired certificate/i, /cert expiry/i],
  "user error data": [/incorrect data/i, /wrong data/i, /bad data/i, /user typo/i, /mistyped/i, /misentered/i, /data entry error/i],
  "user error procedure": [/user error/i, /wrong procedure/i, /incorrect process/i, /process gap/i, /step missed/i, /manual error/i, /human error/i, /business process/i, /wrong process/i],
  "false alert": [/false alert/i, /false positive/i, /spurious alert/i, /false alarm/i],
  "user query": [/user query/i, /usage question/i, /how to/i, /how do/i],
  "information request": [/information request/i, /info request/i, /request for information/i, /need details/i],
  "user access issue": [/access denied/i, /permission denied/i, /cannot access/i, /no access/i, /access issue/i, /access problem/i],
  "password reset": [/password reset/i, /reset password/i, /forgot password/i],
  "job schedule scheduler error": [/job failed/i, /scheduler/i, /scheduled job/i, /batch job/i, /job error/i, /cron/i, /job schedule/i],
  "external 3rd party": [/third party/i, /3rd party/i, /external/i, /vendor/i, /supplier/i],
  "duplicate incident": [/duplicate incident/i, /duplicate ticket/i, /already reported/i, /existing incident/i, /duplicate/i],
  "not an issue": [/not an issue/i, /no issue/i, /not a problem/i, /working as designed/i, /works as expected/i, /no problem found/i, /everything works/i],
  "invalid issue": [/invalid issue/i, /not ours/i, /wrongly assigned/i, /misassigned/i, /invalid ticket/i, /incorrectly assigned/i, /mistakenly assigned/i],
  "dependent application failure": [/dependent application/i, /dependency failure/i, /dependent app/i],
  "configuration issue": [/configuration issue/i, /misconfiguration/i, /config issue/i, /wrong parameter/i, /config change/i, /missing config/i, /incorrectly configured/i],
  "workaround solution": [/workaround/i, /temporary fix/i, /temp fix/i, /until (?:the )?vendor/i, /until (?:the )?patch/i, /reboot/i, /restart/i, /monitoring/i, /temporary/i],
  "permanent solution": [/permanent/i, /code change/i, /permanent fix/i, /reconfigured/i, /implemented/i, /patched/i],
  "verification only": [/verification only/i, /confirmed working/i, /verify/i],
  "not applicable": [/not applicable/i, /not apply/i, /\bn\/?a\b/i]
};

export { norm, tokens };

/**
 * Categorises one field with a label-directed cascade:
 *   A) if a labeled section (e.g. "Root Cause Category:" / "Resolution Type:")
 *      is present, categorise JUST its value — the cleanest signal;
 *   B) otherwise (or when the labeled value yields no category), categorise the
 *      whole note.
 * The explicit label always wins when its value resolves to a category.
 */
export function categorizeField(
  notes: unknown,
  labelKeys: SectionKey[],
  candidateLabels: string[],
  hints?: Record<string, string[]>
): MsrScore {
  const body = String(notes ?? "");
  const opts: ClassifyMsrOptions = { hints: hints || {} };
  const labeled = findLabeledValue(body, labelKeys);
  if (labeled.trim()) {
    const a = classifyMsr(labeled, candidateLabels, opts);
    if (a.label) return a;
  }
  return classifyMsr(body, candidateLabels, opts);
}
