# Data Viewer

The data view is where you inspect, search, edit, classify, and export a pulled
dataset. Open it with **Open data view** in the panel.

![The data view](images/placeholder.png)

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

## Export

Fill the MSR workbook or copy rows for pasting — see [Export](Export).

---
Related: [Calclens](Calclens) · [Classification](Classification) ·
[Export](Export) · [Timezone Contract](Timezone-Contract)
