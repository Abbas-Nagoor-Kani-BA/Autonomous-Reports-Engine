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

Both WSR and MSR use the same NETWORKDAYS + MEDIAN pattern for P3/P4. All dates in Excel are
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

**P1/P2 do not use business hours at all.** They use raw wall-clock subtraction (`end − start`)
for every column — IncidentHours, IncCurrentHours, and ResponseSLA. This is because P1/P2
are 24/7 obligations: SLA time accumulates through nights, weekends, and bank holidays.

---

## Full calculation formulas

This section documents the exact step-by-step formula logic for every calculated column,
covering both priorities. Verified against the extracted Excel formulas and the app source.

### IncidentHours  (WSR col J / MSR col Z)

Measures the total ticket lifetime from creation to resolution.

**P3/P4 — business hours:**
```
gross  = biz(created, resolved)          # business hours Mon-Fri 08:00-17:00
susp   = biz(suspended, resumed)         # 0 when either endpoint missing
result = gross − susp
```
- If resolved is missing (open ticket): `gross = biz(created, NOW())`
- Suspend subtraction only happens when BOTH suspended and resumed are present.

**P1/P2 — wall-clock:**
```
result = resolved − created              # raw elapsed, no clipping, no suspend subtraction
```
The suspend window is **not subtracted** for P1/P2. Being put on hold does not pause the
P1/P2 SLA clock.

**App function:** `calcBusinessHours` in `core/report.ts`

---

### IncCurrentHours  (WSR col L / MSR col AB)

Measures the time from assignment to resolution (or now for open tickets). This is the primary
SLA metric used for MetMin/MaxResolution.

**P3/P4 — business hours, four scenarios:**

| Condition | Formula |
|---|---|
| Resolved (N present) | `biz(assigned, resolved) − biz(suspended, resumed)` |
| Open, not on hold (N absent, O absent) | `biz(assigned, NOW()) − 0` |
| Open, on hold (N absent, O present, P absent) | `biz(assigned, suspended)` — clock frozen at suspend time |
| Open, resumed (N absent, O present, P present) | `biz(assigned, NOW()) − biz(suspended, resumed)` |

**P1/P2 — wall-clock:**
```
result = resolved − assigned             # raw elapsed, no clipping
```
The suspend window is **not subtracted** for P1/P2.

**App function:** `calcIncCurrentHours` in `core/report.ts`

---

### TotalSuspendedTime  (WSR col I only)

WSR computes this as a standalone column so J and L can subtract it with a simple `H − I` and
`G − I`. MSR embeds the suspend subtraction directly inside the IFS formula.

```
result = biz(suspended, resumed)         # P3/P4 business hours
       = 0   when either endpoint missing
```

P1/P2: not computed separately; never subtracted.

**App field:** `rep.suspendWindowHours` (computed inline in `buildReport`)

---

### ResponseSLA  (WSR col N / MSR col AD)

Measures how long it took to acknowledge the ticket after assignment.

**P3/P4 — business hours:**
```
result = biz(assigned, ack)
```
If ack is missing (not yet acknowledged): `result = biz(assigned, NOW())`

**The suspend window is NEVER subtracted from ResponseSLA in either WSR or MSR.**
This is correct behaviour: the ack must happen before any suspend event in normal flow,
so there is nothing to subtract.

**P1/P2 — wall-clock:**
```
result = ack − assigned                  # raw elapsed
```
Same rule applies: no suspend subtraction.

**App function:** `calcResponseSLA` in `core/report.ts`

> ⚠️ Known bug: the current app implementation of `calcResponseSLA` subtracts the suspend
> window for P3/P4, which does not match the Excel. The fix is to remove the suspend
> subtraction block from the P3/P4 branch. See Gap 1 below.

---

### IncidentTotalAge  (WSR col K / MSR col AA)

```
result = IncidentHours × 24 / 9         # fractional working days
```

**App function:** `calcTotalAgeDays(incidentHoursRaw)`

---

### IncidentCurrentAge  (WSR col M / MSR col AC)

```
result = IncCurrentHours × 24 / 9       # fractional working days
```

**App function:** `calcTotalAgeDays(incCurrentHoursRaw)`

---

### CumulativeSLA  (MSR col AE)

```
result = SUMIFS(IncCurrentHours_column, RefNo_column, this_RefNo)
```

Sums IncCurrentHours across every row that shares the same reference number. Handles
reopened tickets that appear on multiple MSR rows.

**App field:** `rep.cumulativeSla = incCurrentHours` (single-row only — see Gap 2)

---

### MetResponseSLA  (MSR col AH)

```
result = IF(ResponseSLA < response_target, "YES", "No")
```

| Priority | Response target |
|---|---|
| P1 | 5 min (0.0833 h) |
| P2 | 15 min (0.25 h) |
| P3 | 2 h |
| P4 | 3 h |

**App field:** `rep.metResponseSLA` in `buildReport`

---

### MetMinResolutionSLA  (MSR col AI)

```
result = IFNA(IF(CumulativeSLA < min_target, "YES", "NO"), "")
```

Uses **CumulativeSLA** (not IncCurrentHours) so reopened tickets are assessed on total effort.
Returns `""` when priority is not found in the lookup table.

| Priority | Min target |
|---|---|
| P1 | 1 h |
| P2 | 2 h |
| P3 | 9 h |
| P4 | 90 h |

**App field:** `rep.metMinResolutionSLA` via `metSLA(incVal, priority, "min")`

---

### MetMaxResolutionSLA  (MSR col AJ)

```
result = IFNA(IF(CumulativeSLA < max_target, "YES", "NO"), "")
```

| Priority | Max target |
|---|---|
| P1 | 4 h |
| P2 | 8 h |
| P3 | 45 h |
| P4 | 135 h |

**App field:** `rep.metMaxResolutionSLA` via `metSLA(incVal, priority, "max")`

---

## P1/P2 suspend window — confirmed behaviour

Verified against the MSR formula source and against 10 synthetic test tickets (5 P1, 5 P2)
covering normal, breached, with-suspend, overnight, and weekend-spanning scenarios.

**MSR formula for P1/P2 (all three columns):**
```excel
IF(NOT(OR(G=1, G=2)),
   <biz_hours_path>,          ← P3/P4 branch — does subtract suspend
   <wall_clock_path>          ← P1/P2 branch: simply N-L or M-L, NO suspend sub
)
```

The P1/P2 branch is a plain subtraction (`resolved − assigned`). There is no suspend
subtraction in that branch, in any column, in either spreadsheet.

**App implementation:** P1/P2 hit an early `return` inside `calcBusinessHours`,
`calcIncCurrentHours`, and `calcResponseSLA` before the suspend subtraction block is reached.
The result is identical to the MSR.

**Practical consequence:** A P1 or P2 ticket that is put on hold still accumulates SLA time
while on hold. Example — P2 assigned at 08:05, suspended 12:00–14:00, resolved at 18:00:
- IncCurrentHours = `18:00 − 08:05` = **9:55** (includes the 2h on-hold period)
- MSR = **9:55**, App = **9:55** ✅

This is intentional. P1/P2 carry 24/7 SLA obligations; suspend pauses are not excused.

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
| G | InProgressTime (FromASG) | `biz(B, D)` | Gross business hours Assigned → Resolved. No suspend sub. |
| H | InProgressTime (FromCRT) | `biz(A, D)` | Gross business hours Created → Resolved. No suspend sub. |
| I | TotalSuspendedTime | `biz(E, F)` | Business hours of the suspend window only. |
| J | IncidentHours (FromCRT) | `H − I` | Net: gross − suspend. P1/P2 not applicable (WSR is P3/P4 only). |
| K | IncidentTotalAge | `ROUND((J × 24) / 9, 2)` | J in working days (9 h/day). |
| L | IncCurrentHours (FromASG) | `G − I` | Net: gross − suspend. |
| M | IncidentCurrentAge (ASG) | `ROUND((L × 24) / 9, 2)` | L in working days. |
| N | ResponseSLA | `biz(B, C)` | Business hours Assigned → Ack. **No suspend subtraction.** |
| O | CumulativeSLA | `L` | Copy of IncCurrentHours. |
| P | CumulativeDays | `M` | Copy of IncidentCurrentAge. |
| Q | TimeTakenInHours | `TEXT(L, "[hh]:mm:ss")` | L formatted as `HH:MM:SS`. |

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

| Col | Label | P1/P2 formula | P3/P4 formula |
|---|---|---|---|
| Z | IncidentHours | `N − K` (wall-clock, **no suspend sub**) | `biz(K,N) − biz(O,P)` when O+P present; `biz(K,NOW())` when open |
| AA | IncidentTotalAge | `(Z × 24) / 9` | same |
| AB | IncCurrentHours | `N − L` (wall-clock, **no suspend sub**) | see 4-scenario table above |
| AC | IncidentCurrentAge | `(AB × 24) / 9` | same |
| AD | ResponseSLA | `M − L` (wall-clock, **no suspend sub**) | `biz(L,M)` — **no suspend sub either** |
| AE | CumulativeSLA | `SUMIFS(AB:AB, E:E, thisRow_E)` | same |
| AF | CumulativeDays | `(AE × 24) / 9` | same |
| AG | TimeTaken | `AF` (copy) | same |
| AH | MetResponseSLA | `IF(AD < target, "YES", "No")` | same |
| AI | MetMinResolutionSLA | `IFNA(IF(AE < min, "YES", "NO"), "")` | same |
| AJ | MetMaxResolutionSLA | `IFNA(IF(AE < max, "YES", "NO"), "")` | same |

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

### Gap 1 — ResponseSLA incorrectly subtracts suspend window (confirmed bug, P3/P4 only)

**Excel (WSR col N, MSR col AD):** `biz(assigned, ack)` only. No suspend subtraction in any
priority. For P1/P2 it is wall-clock `ack − assigned`; for P3/P4 it is business hours. Neither
path subtracts the suspend window.

**App `calcResponseSLA`:** the P3/P4 branch currently subtracts
`businessHoursBetween(suspended, resumed)`, which does not match the Excel.

P1/P2 are **not affected** — they take the early-return wall-clock path before the subtraction
block.

Fix: remove the suspend subtraction block from the P3/P4 branch of `calcResponseSLA` in
`core/report.ts`.

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
No business-hours calculation is applied, and the suspend window is not subtracted. ✅

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
