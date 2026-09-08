# Calclens

Calclens explains **how each derived value was computed** for a ticket — the
assign, acknowledge, suspend, and resume moments and the durations derived from
them — and flags rows that need attention.

![The Calclens panel](images/placeholder.png)

## What it shows

For a selected row, Calclens breaks down each derived timeline value: which
event produced it, when, and why. This makes the four timeline rules auditable
per ticket rather than opaque. The rules themselves are documented in
[Timeline and SLA Rules](Timeline-and-SLA-Rules).

## Needs-attention highlights

Calclens runs a rule engine that flags rows where a derived value looks
suspicious (for example missing audit history, or a timeline that does not fit
the expected order). A per-rule **highlight-toggle dropdown** sits next to the
Calclens button:

- Toggle individual flags on/off, or use **Show all** / **Hide all**.
- The button shows an indicator when highlights are active.
- Tooltips always list **every** flag for a row; the toggles gate only whether
  the cell is visually highlighted. The enabled set is persisted.

![The highlight-toggle dropdown](images/placeholder.png)

## Why this matters

Because a non-identity time formatter changes derived SLA results (see
[Timezone Contract](Timezone-Contract)), Calclens is the fastest way to confirm
a ticket's numbers before they land in the exported report.

---
Related: [Data Viewer](Data-Viewer) ·
[Timeline and SLA Rules](Timeline-and-SLA-Rules) · [Export](Export)
