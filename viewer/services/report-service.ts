import { buildReport, type WalkedRow, type MessageFormatter } from "../../core/sla/report.ts";
import {
  buildSlaSummary,
  buildSlaSummaryRows,
  type SlaSummaryItem
} from "../../core/sla/slasummary.ts";

/*
 * Report and SLA computation for the viewer (core/sla/report.ts + core/sla/slasummary.ts
 * hold the pure work; this service adapts the viewer's two-arg instance-clock
 * formatter to the core one-arg MessageFormatter).
 *
 * The coupling is intentional and load-bearing: fmt normalises dates before the
 * SLA derivation runs, so a non-identity formatter changes derived results (not
 * just displayed text). Keep the cast in exactly this one place.
 */

export type ReportRow = Record<string, any>;
export type ReportFmt = (utcIso: string, row: ReportRow) => string;

/** Export-time report selections sourced from the MSR option lists. When
 *  omitted, buildReport falls back to its "BA"/"AO" defaults. */
export type ReportChoices = { opCo?: string; domain?: string };

export type SlaSummaryResult = ReturnType<typeof buildSlaSummary>;

export class ReportService {
  rep(row: ReportRow, fmt: ReportFmt, choices?: ReportChoices): Record<string, any> {
    return buildReport(
      row as WalkedRow,
      fmt as unknown as MessageFormatter,
      undefined,
      choices ? { opCo: choices.opCo, domain: choices.domain } : undefined
    ) as Record<string, any>;
  }

  slaSummary(rows: ReportRow[] | null | undefined, fmt: ReportFmt): SlaSummaryResult {
    return buildSlaSummary(
      (rows || null) as WalkedRow[] | null,
      fmt as unknown as MessageFormatter
    );
  }

  slaSummaryRows(rows: ReportRow[] | null | undefined, fmt: ReportFmt): SlaSummaryItem[] {
    return buildSlaSummaryRows(
      (rows || null) as WalkedRow[] | null,
      fmt as unknown as MessageFormatter
    );
  }
}
