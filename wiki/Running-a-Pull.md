# Running a Pull

The side panel drives every pull. This page describes the panel from top to
bottom and the Preview / Run workflow.

![The side panel](images/placeholder.png)

## Header

- **Connection badge** — shows `Not connected` / `Connected`.
- **Settings** (gear) — opens the options page. See [Configuration](Configuration).

## Instance

Enter the **Instance URL** and click **Connect**. Connect is **local-only
validation** — it checks the URL shape and readiness; it does not call
ServiceNow. The actual authentication happens on the first request through your
logged-in tab (see [Authentication Chain](Authentication-Chain)).

## Filters

- **Ticket type** — Incident, Change Request, Problem, RITM, or SCTASK.
- **Conditions** — add condition rows with **+ Add condition**.
- **Saved filter sets** — build a list with **+ Add to filter list**; a Run
  pulls every set in the list. **Load preset** replaces the list with a saved
  preset (WSR is the built-in Weekly Status Report preset).
- **Pull change requests for Weekly Summary** — also pulls this week's change
  requests to fill the Weekly Summary sheet (last week implemented/failed, next
  week planned) plus P1/P2 incidents.
- **Advanced** — a raw encoded-query override and a preview of the generated
  query.

Filters and presets are covered in depth in
[Filters and Presets](Filters-and-Presets).

## Preview vs Run

```mermaid
sequenceDiagram
    participant U as You
    participant P as Panel
    participant C as Cache (IndexedDB)
    participant SN as ServiceNow
    U->>P: Preview
    P->>SN: COUNT per filter set (always live)
    SN-->>P: matched totals
    P-->>U: counts (+ max-tickets warnings)
    U->>P: Run
    Note over P,C: Phase 1 — list
    P->>C: query cache fresh?
    alt fresh hit within TTL
        C-->>P: cached records (no API call)
    else miss / expired
        P->>SN: Phase 1 — paginated list (RUN)
        P->>C: store records
    end
    Note over P,C: Phase 2 — timelines (per ticket)
    P->>C: timeline cached and not stale?
    alt reused
        C-->>P: cached events
    else needs fetch
        P->>SN: activity feed (list_history.do)
        P->>C: store events
    end
    P-->>U: progress + done summary
```

- **Preview** runs a COUNT per filter set and shows how many tickets match,
  including any max-tickets-limit warnings.
- **Run** performs the two-phase pull:
  - **Phase 1** — the paginated ticket list from the Table API.
  - **Phase 2** — the per-ticket activity feed (`list_history.do`), replayed to
    compute the timeline and SLA values.

COUNT and RUN are the only server operations. See
[Two-Phase Pipeline](Two-Phase-Pipeline).

![A pull in progress](images/placeholder.png)

## Caching during a pull

A Run does not always hit ServiceNow. Two cache layers (both in the
`snAnalyzerCache` IndexedDB database) sit behind the pull:

- **Query cache (Phase 1).** The result of a filter set's list request is
  cached, keyed by table + encoded query. If the **same** query ran within the
  **Query cache TTL** (Settings; default 15 minutes, `0` disables), the pull
  reuses those records with **no API call** and logs
  `CACHE HIT — reused N tickets from M min ago`. **Preview (COUNT) is always
  live** — only the Phase 1 list is cached.
- **Timeline cache (Phase 2).** Each ticket's activity feed is cached per ticket
  and reused unless the ticket has changed since (compared against its
  `sys_updated_on`). Reused timelines are logged as
  `N/total timelines reused from cache`. Entries are retained up to 7 days.

Why it matters here: Phase 2 is **one request per ticket with no batching**, so
the timeline cache is what makes re-running a pull affordable. To force fresh
data, lower the TTL (or set it to `0`) or use **Clear pull cache** in Settings.
The **classification** and **ML model** caches are separate and are not touched
by a pull. See [Caching](Caching) for the full picture.

## Progress, log, and results

- A **progress bar**, **stage label**, and **pull counter** track the run.
- The **Log** card mirrors requests and activity; click its header to open the
  full **request & activity log** modal (with **Copy all**).
- The footer shows the **last run** summary.

When a pull reuses cached data you will see `CACHE HIT` messages in the log
(query results) and `timelines reused from cache` (Phase 2). See
[Caching](Caching).

## After a pull

Click **Open data view** to search, edit, classify, and export. See
[Data Viewer](Data-Viewer).

> Keep the ServiceNow tab open during a pull and export; requests and the file
> download rely on it.

---
Related: [Filters and Presets](Filters-and-Presets) ·
[Two-Phase Pipeline](Two-Phase-Pipeline) · [Data Viewer](Data-Viewer)
