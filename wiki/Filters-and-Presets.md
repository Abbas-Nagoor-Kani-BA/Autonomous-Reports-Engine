# Filters and Presets

The panel builds a ServiceNow encoded query from three inputs: the ticket type,
your conditions, and the configured queue scope. This page covers conditions,
filter sets, presets, and the built-in WSR preset.

![Conditions and the filter list](images/placeholder.png)

## Conditions

Add condition rows under **Conditions** with **+ Add condition**. Each row
targets a field with an operator and value. The queue scope from
[Configuration](Configuration) is always applied — you do not add it as a
condition.

The **Advanced** section shows the **generated query** and lets you append a
**raw encoded-query override** (e.g. `priority=1^category=network`) for
conditions the builder does not expose.

## Filter sets — "Run pulls all"

Use **+ Add to filter list** to save the current ticket type + conditions as a
**filter set**. Build several, and a single **Run** pulls **all** of them:

- Each set can target its own table (ticket type).
- Per-table results are unioned by `sys_id`, so the same ticket pulled by two
  sets is not duplicated.
- Each set is independently subject to the **Max tickets per filter set** cap
  (see [Configuration](Configuration)); a set over the cap is skipped with a
  warning rather than pulled.
- **Clear all** empties the list so a Run uses only the live filters.

## Presets

The preset menu (the `⋮` button on the filter list card) offers:

- **Save preset…** — name and store the current filter list.
- **Load preset** — replace the filter list with a saved preset.

![The preset options menu](images/placeholder.png)

### WSR — the built-in Weekly Status Report preset

**WSR** is a built-in preset (reserved value `__wsr__`; users cannot create a
preset named "WSR") that loads the standard Weekly Status Report filter list —
one filter set per (table, state), with closed states scoped to **last week** by
`closed_at`.

### The Weekly Summary sheet

Ticking **Pull change requests for Weekly Summary** adds data for the WSR
workbook's Summary sheet. Weeks are **Monday–Sunday**, and the derivation
(`core/summarydetails.ts`) buckets rows into:

| Summary section | Source | Rule |
|---|---|---|
| **Key Incidents** | already-pulled incident rows | P1/P2 incidents resolved **last** week |
| **Changes Implemented** | change_request | `end_date` in **last** week, not failed and not cancelled |
| **Changes Failed** | change_request | `end_date` in **last** week with `review_status = fail` |
| **Changes Planned** | change_request | `start_date` in the **current** week (this bucket is labelled "next week" in the UI) |

The change requests are pulled as **two scoped requests** — kept separate
because OR-ing the queue scope across both windows makes the encoded query long
enough for ServiceNow to reject with 400. The **last week** window is keyed on
`end_date` (changes that ended = implemented/failed) and the **planned** window
on `start_date` in the **current** week (changes scheduled to start this week).
The planned window is still named/labelled **"next week"** in the UI and stored
model for historical reasons, but it deliberately covers the current week. They
need no timelines. Dates are emitted as Excel serial numbers to match the
template's date cells; the rest of the Summary sheet is human-authored
narrative.

### Viewing and editing the change-request filter

The exact filter used for those two requests is shown as text directly beneath
the **Pull change requests for Weekly Summary** checkbox, so you can see what
will be pulled. An **Edit** button opens the same condition builder used for
other ticket types, pre-loaded with the two windows (a **Last week
(implemented)** / **Next week (planned)** switcher). While editing, the primary
button reads **Save weekly summary** instead of *Add to filter list*.

- You may change the **start/end dates** of each window and add extra
  `change_request` conditions.
- Each window **must keep its date range** — the last-week window keeps its
  `end_date` range and the next-week window keeps its `start_date` range. Saving
  is rejected with a message if a window's dates are removed or emptied, because
  the Summary sheet derivation depends on those two windows.
- A saved override keeps your **extra conditions** sticky, but the **date
  windows auto-advance** to the current Monday–Sunday weeks on every run — so an
  override never silently pins a stale week. If you explicitly change a window's
  start/end date and save, that window's dates are treated as custom and kept as
  you set them (the other window still auto-advances). **Reset to this week's
  dates** clears the override entirely and returns to the computed defaults.

The override is stored locally (`STORAGE.changeSummaryFilter`), resolved by
`core/summary/change-summary-filter.ts`, and threaded into the pull via the run
request's `changeSummaryWindows`; when no override is stored the pull is
byte-identical to the previous hardcoded behaviour.

## Closed-state date filtering

When the selected state's label starts with "close" (Closed
Complete/Incomplete/Skipped), a date block appears and filters on `closed_at`
BETWEEN the two required dates. See [Roadmap](Roadmap) for table-specific
caveats.

---
Related: [Running a Pull](Running-a-Pull) · [Configuration](Configuration) ·
[Two-Phase Pipeline](Two-Phase-Pipeline)
