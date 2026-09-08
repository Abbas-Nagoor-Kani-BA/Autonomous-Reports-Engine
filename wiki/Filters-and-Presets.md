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

**WSR** is a built-in preset that loads the standard Weekly Status Report filter
list. Pair it with the **Pull change requests for Weekly Summary** checkbox to
also gather:

- last week's **implemented** / **failed** change requests,
- next week's **planned** change requests, and
- last week's **P1/P2 incidents** (Key Incidents come from the pulled incident
  rows).

The change-request windows are pulled as two scoped requests (last week, next
week) filtered by `start_date`; they need no timelines.

## Closed-state date filtering

When the selected state's label starts with "close" (Closed
Complete/Incomplete/Skipped), a date block appears and filters on `closed_at`
BETWEEN the two required dates. See [Roadmap](Roadmap) for table-specific
caveats.

---
Related: [Running a Pull](Running-a-Pull) · [Configuration](Configuration) ·
[Two-Phase Pipeline](Two-Phase-Pipeline)
