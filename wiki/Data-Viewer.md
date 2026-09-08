# Data Viewer

The data view is where you inspect, search, edit, classify, and export a pulled
dataset. Open it with **Open data view** in the panel.

![The data view](images/placeholder.png)

## Where the data comes from

The viewer reads its rows from **`chrome.storage.local`**, under the `lastData`
key — **not** from the IndexedDB caches. The flow is:

```mermaid
flowchart LR
    PULL[Pull pipeline] -->|merge + persist dataset| LS[[chrome.storage.local · lastData]]
    LS -->|load on open + on change| VIEW[Data Viewer]
    VIEW -->|edits / classification saved back| LS
    CACHE[(IndexedDB caches)] -.behind the pull, not read by viewer.-> PULL
```

- A **Run** merges the pulled + analysed rows into the dataset and writes it to
  `lastData` (`services/pull-service.ts`), then broadcasts a change.
- The viewer loads `lastData` on open and **live-reloads** when it changes
  (`surfaces/viewer/store.ts` listens on `chrome.storage.onChanged`), so a pull
  started elsewhere refreshes the grid.
- Your **edits** and **classification results** are saved back to `lastData`
  (debounced), so they survive reloads.

The IndexedDB caches (`snAnalyzerCache`, `snAnalyzerClassCache`,
`snAnalyzerMlModel`) sit **behind the pull** to avoid re-fetching from
ServiceNow and re-inferring classifications; the viewer itself never reads them.
See [Caching](Caching) for the full storage picture.

## The grid

A sortable, scrollable grid of the pulled tickets plus derived columns (assign,
acknowledge, suspend, resume, and derived durations). Times follow the
**instance clock**, not your browser — see [Timezone Contract](Timezone-Contract).

## Column-scoped search

Search within a single column or across all columns, with case and match-mode
options. The search matches the **displayed** value, so what you see is what you
search.

## Column editor

The column editor makes fast bulk edits to a **single column** across the
current view. It is type-aware (dropdown columns are restricted to their MSR
option lists), supports arrow-key navigation, a find filter, and Calclens
highlighting.

![The column editor](images/placeholder.png)

MSR dropdown columns (Root cause category, Solution type, etc.) are constrained
to the values configured under **MSR option lists** in
[Configuration](Configuration), so edited values always validate against export.

## CI split preview

Preview how a ticket's configuration items split into rows before committing, so
multi-CI tickets map correctly into the report.

![The CI split preview](images/placeholder.png)

## Ticket stats

A summary of the loaded dataset (counts and breakdowns) to sanity-check a pull.

## Classification and Calclens

- Root cause and solution type are filled from the closure notes — see
  [Classification](Classification).
- **Calclens** explains how each derived value (including SLA timings) was
  computed and flags rows needing attention — see [Calclens](Calclens).

## Export and Copy for MSR

Export the WSR (Weekly Status Report) workbook, or **Copy for MSR** to paste
formatted rows into your Monthly Status Report sheet without overwriting its
history — see [Export](Export).

---
Related: [Calclens](Calclens) · [Classification](Classification) ·
[Export](Export) · [Timezone Contract](Timezone-Contract)
