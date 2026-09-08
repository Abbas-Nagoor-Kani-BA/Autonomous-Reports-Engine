# Roadmap

Known limits and forward-looking work, expanded from `docs/roadmap.md`.

## Known limits

- **Ticket type semantics.** The type is selectable in the panel (incident,
  change_request, problem, sc_req_item, sc_task), but the four timeline rules
  were designed on **incident** semantics — validate state labels per table
  before trusting results elsewhere. `sc_task` has no OOB "On Hold" state, so
  suspend/resume stay null unless the label exists in that table's `sys_choice`
  list. See [Timeline and SLA Rules](Timeline-and-SLA-Rules).
- **Closed-state filtering** uses `closed_at` BETWEEN dates; the date block
  appears only when the selected state's label is "Closed" and both dates are
  required. Closed-state detection triggers on any label starting with "close"
  (Closed Complete/Incomplete/Skipped).
- **Audit availability** depends on instance retention and roles; tickets
  missing audit rows are reported in the done-message count.

## Roadmap

Possible future work:

- Resume-from-checkpoint for huge pulls (Phase 11a).
- Work-notes text export (Phase 11c).
- Additional tables — RITM, change (Phase 11d).

## Shipped

- Derived duration columns (Phase 11b, `core/durations.ts`).
- Calclens "needs attention" row flags (Phase 11e, `core/attention.ts`), with a
  per-rule highlight-toggle dropdown next to the Calclens button (persisted
  enabled set). Tooltips always list every flag; the toggles gate only the cell
  highlight. See [Calclens](Calclens).

---
Related: [Timeline and SLA Rules](Timeline-and-SLA-Rules) · [Calclens](Calclens) ·
[Release Process](Release-Process)
