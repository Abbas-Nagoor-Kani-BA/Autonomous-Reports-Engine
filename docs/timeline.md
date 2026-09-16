# Timeline and SLA computation

Business requirements — never change semantics without asking.

## The four timeline rules

Computed in `core/phase2.ts` from timeline events (`assignment_group`,
`assigned_to`, `state`), replayed in chronological order:

1. **assignTime** — the entry of the LATEST of OUR queues stay that was
   acknowledged (acked-stay-wins). A ticket is measured against ALL configured
   queues, not just its current group: it may be assigned and acknowledged in
   one of our queues, then travel to another before it is pulled. If NO stay was
   acknowledged, assignTime falls back to the latest entry into any of our
   queues; if the ticket never entered one of our queues, assignTime is null.
   Born-in-queue fallback: if NO group-change events exist but the ticket's
   CURRENT group is one of our queues, assignTime = opened_at. assignTime is
   CLAMPED to never precede opened_at; the clamp does not affect ackn
   eligibility. Ackn checks membership of the flat configured team-member list,
   applied to every configured queue.
2. **acknTime** — the FIRST `assigned_to` change to one of our members inside
   the chosen stay (at/after that stay's entry). Null if no our-queue stay was
   ever acknowledged. acknTime may EQUAL assignTime (a zero-length assign→ack
   interval) when the queue entry and the member assignment share a timestamp.

See [`timeline-scenarios.md`](timeline-scenarios.md) for the full scenario
catalogue (S1–S7 and the real multi-queue example) with exact inputs and
outputs.
3. **suspendTime** — FIRST transition INTO "On Hold" that occurs while the
   current group is one of our queues, restricted to the CHOSEN stay's queue and
   at/after assignTime. State labels come from `core/statechoices.ts`. Feed
   events carry DISPLAY LABELS ("On Hold"); legacy sys_audit rows carried raw
   values ("3") — both are accepted.
4. **resumeTime** — FIRST post-suspend transition to "In Progress"; if none,
   fall back to first post-suspend "Resolved". Null if never resumed.

On Hold transitions while in a different queue (including a different one of our
queues) do NOT count toward the chosen stay's queue. Group changes reset queue
context.

Derived durations (assign→ackn, assign→resolve, suspend total) are computed in
`core/durations.ts` from these four UTC timestamps.

## Timezone contract

- ServiceNow REST raw datetimes are UTC; `parseUtc()` appends Z before parsing.
- All displayed times must follow the INSTANCE clock, never the browser. The
  only reliable oracle is SN's own display/raw pair per record.
- The viewer's `fmtInstant(v, row)` resolves each row's OWN offset from its
  openedAt display/raw pair, so rows spanning DST seasons stay correct.
- Display values are parsed format-tolerantly (`parseSnDisplayMs`).
- Empty timeline events on a run where tickets clearly HAVE history usually
  means the activity feed returned nothing for them; the viewer shows a warning
  banner.
- **The grid passes `fmtInstant` INTO `buildReport`, which uses it to normalise
  dates. A non-identity formatter therefore changes derived SLA results, not
  just displayed text.**

## Export sheet lookup

Sheet lookup normalizes names (`_`/space/case-insensitive, exact then loose) and
NEVER silently falls back to another sheet — a wrong-sheet fill once emptied a
user's report. If formula rows get deleted, strip `xl/calcChain.xml` and set
`fullCalcOnLoad="1"` on `<calcPr>`, or Excel raises its repair dialog.
