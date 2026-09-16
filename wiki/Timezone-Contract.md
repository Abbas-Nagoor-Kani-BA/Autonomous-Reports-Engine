# Timezone Contract

All displayed times follow the **instance clock**, never the browser. This
contract is subtle because the time formatter also feeds SLA derivation.

## Rules

- ServiceNow REST raw datetimes are **UTC**; `parseUtc()` appends `Z` before
  parsing.
- The only reliable oracle for the instance offset is ServiceNow's own
  **display/raw pair** per record.
- The viewer's `fmtInstant(v, row)` resolves **each row's own offset** from its
  `openedAt` display/raw pair, so rows spanning DST seasons stay correct.
- Display values are parsed format-tolerantly (`parseSnDisplayMs`).

## The load-bearing coupling

> The grid passes `fmtInstant` **into** `buildReport`, which uses it to
> normalise dates. A non-identity formatter therefore changes derived **SLA
> results**, not just displayed text.

This means the formatter is not cosmetic: swap in a formatter that shifts times
and you change the numbers in the exported report. Treat `fmtInstant` as part of
the SLA computation path, and test it as such (`tools/tz-unit-test.js`).

## Empty timelines warning

Empty timeline events on a run where tickets clearly **have** history usually
means the activity feed returned nothing for them; the viewer shows a warning
banner. This is distinct from a ticket that genuinely has no relevant events.

## Live verification

`TZ_INSTANCE=… TZ_USER=… TZ_PASS=… node tools/tz-live-check.js` verifies rendered
times against ServiceNow's display values. It needs live credentials, which is
why it is a `-check` (not part of the offline `npm test`). See [Testing](Testing).

---
Related: [Why Time Conversions](Why-Time-Conversions) ·
[Timeline and SLA Rules](Timeline-and-SLA-Rules) ·
[Export Internals](Export-Internals) · [Calclens](Calclens)
