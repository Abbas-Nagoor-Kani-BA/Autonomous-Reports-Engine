import { extractHeuristic } from "../core/aiextract.ts";

/*
 * Viewer-facing wrapper over the closure-note heuristic (core/aiextract.ts).
 *
 * The heuristic itself is pure; this service owns the per-row apply loop the
 * viewer used to run by hand: fill solutionType/rootCause from the closure
 * notes, flag rows for human review whenever the confidence is not "high",
 * and report counts so the caller can decide the messaging. It touches no DOM
 * and performs no I/O.
 */

export type ExtractStats = {
  /** Number of rows inspected this call. */
  total: number;
  /** Rows that had closure notes at all. */
  withNotes: number;
  /** Rows where notes filled at least one field. */
  filled: number;
};

export class ExtractService {
  /** Runs the heuristic over every row and mutates the rows in place.
   *
   *  Only `solutionType` is filled here — it maps closure notes onto a real
   *  resolution category. `rootCause` is intentionally NOT filled: the
   *  heuristic can only capture the free-text RCA analysis, whereas the
   *  rootCause cell must hold a root-cause *category* (an MSR list value).
   *  Categorising is the classifier's job (classifyMsr over the ticket's
   *  root-cause list), which runs on load and knows the ticket type + labels.
   *  Writing the narrative here would put prose into a category field. */
  applyExtraction(rows: Record<string, any>[]): ExtractStats {
    const stats: ExtractStats = { total: rows.length, withNotes: 0, filled: 0 };
    for (const row of rows) {
      const notes = String(row.closeNotes ?? "").trim();
      if (!notes) continue;
      stats.withNotes++;
      if (row.solutionType) continue;
      const h = extractHeuristic(notes);
      if (!h.solutionType) continue;
      row.solutionType = h.solutionType;
      if (h.confidence && h.confidence.solutionType !== "high") {
        row.parseReview = true;
      }
      stats.filled++;
    }
    return stats;
  }
}