# SLA Formula Analysis — Excel vs App

Compares the business-hours and SLA formulas in the WSR/MSR Excel templates against the
TypeScript implementation in `core/report.ts`. Use this as the authoritative reference when
verifying or changing any SLA calculation.

## Source files

| File | Role |
|---|---|
| `wsr-slacal.xlsx` | WSR calculator (single sheet, older format) |
| `App Support - MSR Ticket Tracker (1).xlsx` | MSR tracker (multi-sheet, current format) |
| `core/report.ts` | App implementation — `calcBusinessHours`, `calcIncCurrentHours`, `calcResponseSLA`, `buildReport` |

---

## Business hours formula (Excel)

Both WSR and MSR use the same NETWORKDAYS + MEDIAN pattern. All dates in Excel are
fractional days (1.0 = 24 h); multiply the result by 24 to obtain hours.

```excel
= (NETWORKDAYS(start, end, UKBankHolidays) - 1) * (TIME(17,0,0) - TIME(8,0,0))
  + IF(NETWORKDAYS(end,   end,   UKBankHolidays) > 0,
       MEDIAN(MOD(end,   1), TIME(8,0,0), TIME(17,0,0)),
       TIME(8,0,0))
  - IF(NETWORKDAYS(start, start, UKBankHolidays) > 0,
       MEDIAN(MOD(start, 1), TIME(8,0,0), TIME(17,0,0)),
       TIME(8,0,0))
```

Working hours: **Mon–Fri 08:00–17:00** (9 h/day).  
The `UKBankHolidays` named range contains UK public holidays — those days are excluded entirely.

The app equivalent is `businessHoursBetween(start, end)` in `core/report.ts`, which iterates
weekdays and clips to 08:00–17:00 **but does not exclude bank holidays** (see Gap 3 below).

---

## WSR column map

The WSR spreadsheet (`wsr-slacal.xlsx`) is a single-sheet calculator.

### Input columns

| Col | Label |
|---|---|
| A | Created date & time |
| B | Assigned date & time |
| C | Acknowledged date & time |
| D | Resolved date & time |
| E | Clock suspended time |
| F | Clock resume time |

### Calculated columns

| Col | Label | Formula | Notes |
|---|---|---|---|
| G | InProgressTime (FromASG) | `biz(B, D)` | Business hours Assigned → Resolved. No suspend subtraction. |
| H | InProgressTime (FromCRT) | `biz(A, D)` | Business hours Created → Resolved. No suspend subtraction. |
| I | TotalSuspendedTime | `biz(E, F)` | Business hours of the suspend window only. |
| J | IncidentHours (FromCRT) | `H − I` | Gross created→resolved minus suspend. Flat subtraction. |
| K | IncidentTotalAge | `ROUND((J × 24) / 9, 2)` | J converted to working days (9 h/day). |
| L | IncCurrentHours (FromASG) | `G − I` | Gross assigned→resolved minus suspend. Flat subtraction. |
| M | IncidentCurrentAge (ASG) | `ROUND((L × 24) / 9, 2)` | L in working days. |
| N | ResponseSLA | `biz(B, C)` | Business hours Assigned → Acknowledged. **No suspend subtraction.** |
| O | CumulativeSLA | `L` | Copy of IncCurrentHours. |
| P | CumulativeDays | `M` | Copy of IncidentCurrentAge. |
| Q | TimeTakenInHours | `TEXT(L, "[hh]:mm:ss")` | L formatted as `HH:MM:SS`. |

Key design point: the WSR computes the suspend window separately as column I, then performs a
simple `gross − I` subtraction for J and L. It never subtracts the suspend window from
ResponseSLA (col N).

---

## MSR column map

MSR has one data sheet per team queue (e.g. BA AO = `xl/worksheets/sheet8.xml`). All sheets
share the same formula layout.

### Input columns

| Col | Label |
|---|---|
| E | Reference Number (ticket number) |
| G | Priority (integer 1 – 4) |
| K | Creation date & time |
| L | Assigned date & time |
| M | Acknowledged date & time |
| N | Resolved date & time |
| O | Clock suspended time |
| P | Clock resume time |

### Calculated columns

| Col | Label | Formula / logic | Notes |
|---|---|---|---|
| Z | IncidentHours | `IFS(K+N present → biz(K,N)−suspend; K present N absent → biz(K,NOW())−suspend; K blank → 0)` | P1/P2: wall-clock `N−K`. Subtracts `biz(O,P)` when both present. |
| AA | IncidentTotalAge | `(Z × 24) / 9` | |
| AB | IncCurrentHours | `IFS(resolved → biz(L,N)−suspend; open, no suspend → biz(L,NOW()); on hold → biz(L,O); resumed → biz(L,NOW())−suspend)` | P1/P2: wall-clock. Subtracts `biz(O,P)` when both present. |
| AC | IncidentCurrentAge | `(AB × 24) / 9` | |
| AD | ResponseSLA | `biz(L, M)` for P3/P4; `M − L` for P1/P2 | **No suspend subtraction.** Uses NOW() when M is blank. |
| AE | CumulativeSLA | `SUMIFS(AB:AB, E:E, E2)` | Sum of IncCurrentHours for every row sharing the same reference number. Handles reopened tickets. |
| AF | CumulativeDays | `(AE × 24) / 9` | |
| AG | TimeTaken | `AF` | Copy of CumulativeDays. |
| AH | MetResponseSLA | `IF(AD < target, "YES", "No")` | Target from ResponseSLA lookup table. |
| AI | MetMinResolutionSLA | `IFNA(IF(AE < SLATable[Minimum], "YES", "NO"), "")` | Based on CumulativeSLA (AE), not IncCurrentHours directly. |
| AJ | MetMaxResolutionSLA | `IFNA(IF(AE < SLATable[Maximum], "YES", "NO"), "")` | Same. |

### MSR SLA tables (Variables sheet, converted to hours)

**Response SLA targets:**

| Priority | Target |
|---|---|
| P1 | 5 min (0.0833 h) |
| P2 | 15 min (0.25 h) |
| P3 | 2 h |
| P4 | 3 h |

**Resolution SLA targets:**

| Priority | Minimum | Maximum |
|---|---|---|
| P1 | 1 h | 4 h |
| P2 | 2 h | 8 h |
| P3 | 9 h | 45 h |
| P4 | 90 h | 135 h |

### UK bank holidays (2026, from Variables sheet)

Jan 1, Apr 3, Apr 6, May 1, May 4, May 25, Aug 31, Dec 25, Dec 28.
These are excluded from all NETWORKDAYS calculations in the MSR.

---

## App implementation mapping

| Excel column | Label | App function / field | Match |
|---|---|---|---|
| WSR H / MSR Z | IncidentHours (gross) | `calcBusinessHours` → `rep.incidentHours` | ✅ |
| WSR I | TotalSuspendedTime | `rep.suspendWindowHours` (computed in `buildReport`) | ✅ |
| WSR J / MSR Z | IncidentHours (net) | gross − suspend inside `calcBusinessHours` | ✅ |
| WSR G / MSR AB | IncCurrentHours (gross) | `calcIncCurrentHours` → `rep.incCurrentHours` | ✅ |
| WSR L / MSR AB | IncCurrentHours (net) | gross − suspend inside `calcIncCurrentHours` | ✅ |
| WSR K / MSR AA | IncidentTotalAge | `calcTotalAgeDays(incidentHoursRaw)` → `rep.incidentTotalAge` | ✅ |
| WSR M / MSR AC | IncidentCurrentAge | `calcTotalAgeDays(incCurrentHoursRaw)` → `rep.incidentCurrentAge` | ✅ |
| WSR N / MSR AD | ResponseSLA | `calcResponseSLA` → `rep.responseSLA` | ❌ Gap 1 |
| MSR AE | CumulativeSLA | `rep.cumulativeSla = incCurrentHours` | ❌ Gap 2 |
| MSR AF | CumulativeDays | `rep.cumulativeDays = incidentCurrentAge` | ❌ follows Gap 2 |
| MSR AH | MetResponseSLA | `metResponse` in `buildReport` | ✅ |
| MSR AI | MetMinResolutionSLA | `metSLA(incVal, priority, "min")` | ✅ |
| MSR AJ | MetMaxResolutionSLA | `metSLA(incVal, priority, "max")` | ✅ |

The `SLA_TABLE` and `RESPONSE_SLA_TABLE` constants in `core/report.ts` match the MSR Variables
sheet values exactly.

---

## Gaps and differences

### Gap 1 — ResponseSLA incorrectly subtracts suspend window (confirmed bug)

**Excel (WSR col N, MSR col AD):** `biz(assigned, ack)` only. The suspend window is never
subtracted from ResponseSLA in either spreadsheet.

**App `calcResponseSLA`:** currently subtracts `businessHoursBetween(suspended, resumed)`,
which is wrong.

Fix: remove the suspend subtraction block from `calcResponseSLA` in `core/report.ts`.

### Gap 2 — CumulativeSLA is not a true SUMIFS

**MSR col AE:** `SUMIFS(AB:AB, E:E, E2)` — sums IncCurrentHours across every row that shares
the same reference number. This matters when a ticket is closed, reopened, and re-closed: it
would appear on two MSR rows and the cumulative total reflects the full lifetime effort.

**App:** `cumulativeSla = incCurrentHours` (single-row value only).

Impact: MetMin/MaxResolutionSLA will be understated for tickets that appear on multiple MSR
rows. Fix required only if reopened tickets are expected to appear as separate MSR rows.

### Gap 3 — UK bank holidays not excluded

**Excel:** `NETWORKDAYS(start, end, UKBankHolidays)` skips UK public holidays entirely.

**App `businessHoursBetween`:** skips Saturday and Sunday only. A ticket spanning a UK bank
holiday (e.g. 25 Dec) will accumulate one extra business day of SLA time in the app compared
to Excel.

Fix: add a configurable bank-holiday list to `businessHoursBetween`. The list changes annually
and is currently hardcoded in the MSR Variables sheet.

### Gap 4 — P1/P2 wall-clock (no gap)

Both Excel and the app use raw elapsed time (`end − start`) for Priority 1 and Priority 2.
No business-hours calculation is applied. ✅

---

## When does a formula produce an empty or zero result?

| Column | Excel condition for blank/zero | App condition |
|---|---|---|
| IncidentHours | Creation date (K) is blank → `0` via IFS fallback | `createdStr` empty or unparseable → returns `""` |
| IncCurrentHours | Assigned date (L) is blank → `0` via IFS fallback | `!assignedStr` → returns `"0"` |
| ResponseSLA | Assigned date missing → formula errors (not shown) | `!assignedStr` → returns `""` |
| MetResponseSLA | AD is blank or priority not in lookup → `""` via IFNA | `slaPriority` returns 0 → `metSLA` returns `""` |
| MetMinResolutionSLA | AE blank or priority not in SLATable → `""` via IFNA | same guard |
| MetMaxResolutionSLA | AE blank or priority not in SLATable → `""` via IFNA | same guard |

Note: MSR wraps MetMin/Max in `IFNA(..., "")` so a missing priority produces a blank cell
rather than a `#N/A` error. The app achieves the same behaviour by returning `""` from
`metSLA` when `slaPriority` returns 0.
