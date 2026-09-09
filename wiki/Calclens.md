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

## Attention filter — "Flagged only"

When Calclens is **ON**, a **Flagged only** button appears next to the Highlights
dropdown. Clicking it narrows the grid to **only the tickets that have at least
one active attention flag**, so you can work through the flagged set without
scrolling past clean rows.

**How it interacts with the Highlights toggles:** the filter respects which rules
are currently enabled. If you disable the *SLA breached* rule in the Highlights
dropdown, tickets flagged solely by that rule are removed from the filtered view.
Enabling it again immediately brings them back.

**Tab-bar chip:** when the filter is active a **⚑ N flagged** chip appears in the
tab bar (next to the CI-split chip). Clicking **✕** on the chip clears the filter
from anywhere, even if the action rail is collapsed.

**Session-only:** the filter is never saved. It always starts off when you reload
or reopen the viewer, so it cannot accidentally hide tickets across sessions.

**Layering:** the attention filter is the last layer in the row pipeline
(search → split-filter → **attention filter**). All three layers are active
simultaneously: you can search within flagged rows, or combine it with a CI-split
view to see flagged tickets for one group only.

**Turning Calclens off** automatically clears the attention filter so the full row
list is immediately visible again.

## Why this matters

Because a non-identity time formatter changes derived SLA results (see
[Timezone Contract](Timezone-Contract)), Calclens is the fastest way to confirm
a ticket's numbers before they land in the exported report.

---
Related: [Data Viewer](Data-Viewer) ·
[Timeline and SLA Rules](Timeline-and-SLA-Rules) · [Export](Export)
