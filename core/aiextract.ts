const SOLUTION_PERMANENT = "Permanent solution";
const SOLUTION_WORKAROUND = "Workaround solution";

/* ------------------------------------------------------------------ */
/* Fuzzy section-label matching                                        */
/* ------------------------------------------------------------------ */

function normLabel(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}

// Strip list bullets / numbering: "-", "* ", "3.", "1)", "(2" ...
function stripPrefix(s: string): string {
  return String(s).replace(/^[ \t]*(?:[-*\u2022]|\d{1,2}[.):-])[ \t]*/, "");
}

// Classic DP edit distance with an early bail-out threshold.
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  const m = a.length, n = b.length;
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

// Known section headers. Variants include common typos and rewordings;
// matching itself is fuzzy (distance 1-2 depending on label length).
type SectionLabel = { key: SectionKey; variants: string[] };
type SectionKey = "rootCauseCategory" | "resolutionType";

const SECTION_LABELS: SectionLabel[] = [
  { key: "rootCauseCategory", variants: ["root cause category", "rootcause category", "rca category", "root cause cat"] },
  { key: "resolutionType", variants: ["resolution type", "resoultion type", "resolution types", "solution type", "resolved type", "resolution status"] }
];

function maxDistFor(variant: string): number {
  return variant.replace(/ /g, "").length >= 10 ? 2 : 1;
}

// A line "looks like" a header when it has an early colon ("Analysis (Root
// Cause): text...") or is short — this stops body sentences that merely begin
// with words like "Impact" from being mistaken for section headers.
function looksLikeHeader(line: string): boolean {
  const t = line.trim();
  const colon = t.indexOf(":");
  return (colon >= 0 && colon <= 45) || t.length <= 60;
}

// Returns the SECTION_LABELS key for a header-looking line, else null.
function lineSectionKey(line: string): SectionKey | null {
  if (!looksLikeHeader(line)) return null;
  const words = normLabel(stripPrefix(line)).split(" ").filter(Boolean);
  if (!words.length) return null;
  for (const sec of SECTION_LABELS) {
    for (const variant of sec.variants) {
      const n = variant.split(" ").length;
      const cand = words.slice(0, n).join(" ");
      if (!cand) continue;
      if (cand === variant || editDistanceWithin(cand, variant, maxDistFor(variant))) {
        return sec.key;
      }
    }
  }
  return null;
}

function findLine(lines: string[], keys: SectionKey[]): number {
  for (let i = 0; i < lines.length; i++) {
    const k = lineSectionKey(lines[i]);
    if (k && keys.includes(k)) return i;
  }
  return -1;
}

// Capture the value belonging to a section header line: the remainder of the
// header line after its colon, plus following lines until the next header.
function captureFrom(lines: string[], startIdx: number): string {
  const head = stripPrefix(lines[startIdx]);
  const colon = head.indexOf(":");
  const kept: string[] = [];
  const first = colon >= 0 ? head.slice(colon + 1) : "";
  if (first.trim()) kept.push(first.trim());
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (lineSectionKey(lines[j])) break;
    // A blank line ends the section value: labels are followed by their value
    // then a blank line before the next section. This keeps the captured value
    // from running into later sections whose headers we no longer track.
    if (kept.length && !lines[j].trim()) break;
    if (lines[j].trim()) kept.push(stripPrefix(lines[j]));
  }
  return kept.join(" ").trim();
}

/* ------------------------------------------------------------------ */
/* Solution type classification                                        */
/* ------------------------------------------------------------------ */

// Token-level fuzzy check so misspellings still map onto a known bucket
// ("Permanant fix" -> permanent, "Work arount" -> workaround).
function tokensInclude(list: string[], target: string, maxDist: number): boolean {
  return list.some(t => t === target || editDistanceWithin(t, target, maxDist));
}

function classifySolution(raw: unknown): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^[:\-)\]]+\s*/, "");
  const tokens = normLabel(s).split(" ").filter(Boolean);
  if (tokensInclude(tokens, "permanent", 1) || tokensInclude(tokens, "permanently", 1)) {
    return SOLUTION_PERMANENT;
  }
  if (
    tokensInclude(tokens, "workaround", 2) ||
    tokensInclude(tokens, "temporary", 1) ||
    tokensInclude(tokens, "monitoring", 1) ||
    tokensInclude(tokens, "education", 1) ||
    tokensInclude(tokens, "cancelled", 1) ||
    normLabel(s).includes("no issue found")
  ) {
    return SOLUTION_WORKAROUND;
  }
  // Unrecognized wording — pass it through untouched so no information is lost.
  return s;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export type ExtractResult = {
  solutionType: string;
  rootCause: string;
  confidence: { solutionType: string; rootCause: string };
  parseReview?: boolean;
};

function extractHeuristic(notes: unknown): ExtractResult {
  const text = String(notes ?? "");
  const out: ExtractResult = { solutionType: "", rootCause: "", confidence: { solutionType: "", rootCause: "" } };
  if (!text.trim()) return out;
  const lines = text.split(/\r?\n/);

  // --- Solution type -------------------------------------------------
  // Preferred: explicit "Resolution Type:" section (fuzzy-matched).
  const rtIdx = findLine(lines, ["resolutionType"]);
  if (rtIdx >= 0) {
    const val = classifySolution(captureFrom(lines, rtIdx));
    if (val) {
      out.solutionType = val;
      out.confidence.solutionType = "high";
    }
  }

  // Fallback 1: "is it permanent: yes/no"-style lines.
  if (!out.solutionType) {
    const ynLine = text.match(/^.*\bpermanent\b[^.\n]*?\b(yes|no|true|false)\b[^0-9]*$/im);
    if (ynLine) {
      out.solutionType = /yes|true/i.test(ynLine[1]) ? SOLUTION_PERMANENT : SOLUTION_WORKAROUND;
      out.confidence.solutionType = "medium";
    }
  }

  // Fallback 2: prose keywords.
  if (!out.solutionType) {
    if (/\bpermanen(?:t|tly)\s+(?:fix|resolved|solution)|\bfixed\s+(?:at\s+)?(?:the\s+)?root\b|\bpermanent\s+solution\s+applied\b/i.test(text)) {
      out.solutionType = SOLUTION_PERMANENT;
      out.confidence.solutionType = "medium";
    } else if (/\bwork\s?-?arounds?\b|\btemporary\b|\btemp\s+fix\b|\buntil\s+(?:the\s+)?(?:vendor|patch)\b/i.test(text)) {
      out.solutionType = SOLUTION_WORKAROUND;
      out.confidence.solutionType = "medium";
    }
  }

  // Root cause is intentionally NOT extracted here as a narrative. The
  // root-cause CATEGORY is derived by the categorizer (categorizeField ->
  // classifyMsr) from the "Root Cause Category" label or the whole note.
  return out;
}

/** Returns the value of the first matching labeled section, or "" when none of
 *  the given section labels is present. Used by the categorizer's label-directed
 *  stage (e.g. "Root Cause Category:" / "Resolution Type:"). */
function findLabeledValue(notes: unknown, keys: SectionKey[]): string {
  const text = String(notes ?? "");
  if (!text.trim()) return "";
  const lines = text.split(/\r?\n/);
  const idx = findLine(lines, keys);
  return idx >= 0 ? captureFrom(lines, idx) : "";
}

export { extractHeuristic, findLabeledValue };
export type { SectionKey };