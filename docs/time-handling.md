# Time handling

How the extension moves a timestamp from ServiceNow to the screen and the
exported workbook, and why several representations exist along the way. This
document is both a plain-language explanation and a contributor reference; the
plain part is the preface, the rest is code-level detail.

For the terse contract, see the "Timezone contract" section of
[`timeline.md`](timeline.md). This document is the long form.

## Preface (why times look the way they do)

Every time you see in the tool follows the **ServiceNow instance clock** — the
same wall-clock time you would see if you opened the record in ServiceNow
itself. It is deliberately NOT your browser's local time. Two people opening the
same pull in different countries must read the same "opened at 11:00", so the
tool never asks the browser what time it is. Instead it learns the instance's
clock from the records themselves and renders every time on that clock.

## The core invariant

- **Raw datetimes from the ServiceNow REST API are UTC.** They arrive without a
  timezone suffix (for example `2026-08-01 10:00:00`), but they are UTC.
- **Display values are already on the instance clock.** The same field also
  arrives as a human display string (for example `2026-08-01 11:00:00` on a
  UTC+1 instance).
- **The browser clock is never trusted.** It plays no part in parsing or
  rendering.
- **The only reliable offset oracle is ServiceNow's own display/raw pair** for a
  record. The gap between the two IS the instance offset for that record.

## The three time representations

A single instant can appear in three forms as it flows through the pipeline.
Each exists for a reason, and each has an owning function.

| Representation | Example | Produced by | Consumed by | Why it exists |
|---|---|---|---|---|
| Raw UTC string (`*Raw`, `*UtcIso`) | `2026-08-01 10:00:00`, `2026-08-01T10:00:00.000Z` | Table API `value`; the four rules in `core/phase2.ts` | `parseUtc` / `parseUtcMs`, `fmtInstant` | Unambiguous, math-safe source of truth |
| SN display value (`openedAt`, `resolvedAt`, …) | `2026-08-01 11:00:00` | Table API `display_value` | offset detection (`pairOffsetMs`) | What a user recognizes; the instance-clock reference |
| Epoch milliseconds | `1785535200000` | `parseUtc`, `parseUtcMs`, `parseSnDisplayMs` | duration/SLA arithmetic (`core/durations.ts`, `core/report.ts`) | Numbers subtract cleanly; strings do not |

The parsing contract that ties raw strings to epochs lives in two matching
helpers:

- `core/phase2.ts` — `parseUtc()` trims the string, turns the space into `T`,
  and appends `Z` when no zone is present before `Date.parse`.
- `core/durations.ts` — `parseUtcMs()` applies the identical rule to the four
  derived timestamps (`assignTimeUtcIso`, `acknTimeUtcIso`, `resolvedAtRaw`,
  `suspendTimeUtcIso`, `resumeTimeUtcIso`).

Both use the same guard: `/(Z|[+-]\d\d:?\d\d)$/` — append `Z` only when the
string carries no zone, so already-zoned strings pass through untouched.

## Where the times come from

The `opened_at` and `resolved_at` fields are fetched in the **Phase 1 Table API
call**, not later. `services/pull-service.ts` lists them in `DEFAULT_FIELDS`,
and the Table API returns each as a `{ value, display_value }` pair:

- `value` is the raw UTC datetime.
- `display_value` is the instance-clock rendering.

`core/phase2.ts` `buildRow` reads that same initial record and stores both
sides:

- `openedAt`  = `fieldValue(rec.opened_at)`  → the display value (instance clock)
- `openedAtRaw` = `rawValue(rec.opened_at)`   → the raw UTC value
- `resolvedAt` / `resolvedAtRaw` likewise.

Phase 2 (the per-ticket activity feed) contributes change **epochs** for the
four timeline rules. Those are already numeric and are treated as UTC instants.

## Resolving the instance offset

Because raw is UTC and display is the instance clock, the difference between a
record's own display and raw values is that record's offset. `core/sntime.ts`
owns this logic:

- `pairOffsetMs(display, raw)` — parses the display value
  (`parseSnDisplayMs`) and the raw value (appending `Z` if unzoned), and returns
  `display − raw` in milliseconds.
- `detectSnOffsetMs(rows)` — a dataset-wide fallback: the **median** offset over
  up to 200 sampled rows, ignoring any pair whose magnitude is 15 hours or more
  (a guard against bad data).
- `rowOffsetMs(row, fallback)` — the per-row offset from that row's own
  `openedAt`/`openedAtRaw` pair, falling back to the dataset median when the
  row's own pair is unusable.
- `fmtWithOffset(epoch, offsetMs)` — renders an epoch plus offset as
  `yyyy-MM-dd HH:mm:ss`.

The viewer's `fmtInstant(utcIso, row)` (`surfaces/viewer/grid.ts`) is the render
entry point: it parses the UTC instant, adds `rowOffsetMs(row, …)`, and formats
the wall-clock result. Resolving **per row** matters because a dataset can span
a daylight-saving boundary — a January ticket and a July ticket on the same
instance can carry different offsets, and each row uses its own.

## Pitfalls (with worked examples)

### 1. A zoneless UTC string parsed as local time

Raw ServiceNow datetimes have no zone but ARE UTC. If such a string is handed to
`Date.parse` without a `Z`, JavaScript reads it in the machine's local zone, and
the resulting instant is shifted by the local offset.

Example — the raw value `2026-01-07 09:00:00` (which is UTC) parsed on a machine
in `America/New_York` (UTC−5 in January):

```
"2026-01-07T09:00:00"   -> read as local -> 14:00 UTC   (WRONG, shifted +5h)
"2026-01-07T09:00:00Z"  -> read as UTC   -> 09:00 UTC   (CORRECT)
```

The rule: **always append `Z` to an unzoned raw datetime before parsing**, which
is exactly what `parseUtc`/`parseUtcMs`/`pairOffsetMs` do.

### 2. The formatter is part of the SLA math

`fmtInstant` is not cosmetic. The grid passes it **into** `buildReport`
(`core/report.ts`), which uses it to normalise dates before computing SLA
values. A formatter that shifts times therefore changes the **derived numbers**
in the report and export, not just the text on screen. Treat `fmtInstant` as
part of the SLA computation path (see [`timeline.md`](timeline.md)).

### 3. Daylight saving inside a dataset

A single fixed offset for the whole pull is wrong when the data spans a DST
change. Example on a UTC+1 instance that observes summer time: a winter ticket's
offset is +1h while a summer ticket's is +2h. Using one number for both would
mis-render half the rows. This is why `fmtInstant` calls `rowOffsetMs` per row
and resolves each row from its own display/raw pair.

### 4. Display formats vary; parse them tolerantly

Display values are not one fixed format — instances differ, and some fields use
12-hour clocks. `parseSnDisplayMs` accepts ISO `yyyy-MM-dd`, `dd-MM-yyyy`,
`dd.MM.yyyy`, and `MM/dd/yyyy`, each with an optional `AM`/`PM` suffix.

Examples (all resolve to the same instant given the same intended time):

```
"2026-08-01 11:00:00"      (ISO)
"01-08-2026 11:00:00"      (dd-MM-yyyy)   -> equal to the ISO parse
"08/01/2026 02:00:00 PM"   (MM/dd/yyyy)   -> 14:00
```

Note the inherent ambiguity of purely numeric day/month orders: only the
raw/display PAIR is authoritative for the offset, so display parsing is used for
offset detection, never as the sole source of truth for an instant.

## How to test time behavior

All commands run from the repository root.

- Full offline suite (includes the timezone units):

  ```bash
  npm test
  ```

- Just the timezone unit suite:

  ```bash
  node --test tools/tz-unit-test.js
  ```

- Run the offline suite under a non-UTC timezone to exercise offset handling:

  ```bash
  TZ=America/New_York npm test
  ```

- Live check against a real instance (verifies rendered times against
  ServiceNow's own display values). It needs live credentials, so it is a
  `-check`, not part of the offline suite:

  ```bash
  TZ_INSTANCE=… TZ_USER=… TZ_PASS=… node tools/tz-live-check.js
  ```

## See also

- [`timeline.md`](timeline.md) — the four timeline rules and the terse timezone
  contract.
- [`sla-formula-analysis.md`](sla-formula-analysis.md) — how the derived times
  feed SLA formulas.
- [`../AGENTS.md`](../AGENTS.md) — repository conventions and the timezone
  contract summary.
- Wiki: **Why Time Conversions** — the plain-language version of this page.
