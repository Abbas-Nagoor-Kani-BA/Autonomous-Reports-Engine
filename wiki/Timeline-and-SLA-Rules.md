# Timeline and SLA Rules

These are **business requirements** — never change the semantics without asking.
They are computed in `core/phase2.ts` from timeline events
(`assignment_group`, `assigned_to`, `state`), replayed in chronological order,
and expanded here from `docs/timeline.md`.

## The four timeline rules

### 1. assignTime

The **LAST** time `assignment_group` changed **TO** the target queue.

- **Born-in-queue fallback**: if there are **no** group-change events but the
  ticket's **current** group equals the queue, `assignTime = opened_at`.
- **Clamp**: `assignTime` is clamped to never precede `opened_at`. The clamp
  does not affect acknowledgement eligibility.
- Each ticket is measured against **its own** current group, and acknowledgement
  checks membership of that queue's member set (the flat configured team-member
  list applied to every selected queue).

### 2. acknTime

The **LAST** time `assigned_to` became a member of the queue's team, counted
**only** if it occurs at/after the latest queue-entry event.

### 3. suspendTime

The **FIRST** transition **INTO** "On Hold" while the current group equals the
queue.

- State labels come from `core/statechoices.ts`.
- Feed events carry **display labels** ("On Hold"); legacy `sys_audit` rows
  carried raw values ("3") — both are accepted.

### 4. resumeTime

The **FIRST** post-suspend transition to "In Progress"; if none, fall back to
the first post-suspend "Resolved". Null if never resumed.

## Rules that apply across all four

- On Hold transitions **while assigned elsewhere** do not count.
- Group changes **reset** the queue context.

## Derived durations

Derived durations (assign→ackn, assign→resolve, suspend total) are computed in
`core/durations.ts` from these four **UTC** timestamps. Because they derive from
the four rules, changing a rule changes the durations.

## Auditability

[Calclens](Calclens) explains, per row, which event produced each value — the
fastest way to verify a ticket before it lands in the report.

## Table caveats

The rules were designed on **incident** semantics. Validate state labels per
table before trusting results elsewhere. `sc_task` has no OOB "On Hold" state,
so suspend/resume stay null unless the label exists in that table's choice list.
See [Roadmap](Roadmap).

## Tests

`tools/phase2-unit-test.js` covers the four rules; `tools/durations-test.js`
covers the derived durations; `tools/slasummary-test.js` and
`tools/report-test.js` cover SLA and report derivation. See [Testing](Testing).

---
Related: [Two-Phase Pipeline](Two-Phase-Pipeline) ·
[Timezone Contract](Timezone-Contract) · [Calclens](Calclens)
