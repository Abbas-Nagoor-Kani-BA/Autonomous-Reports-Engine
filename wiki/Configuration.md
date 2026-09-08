# Configuration

All configuration lives in **Settings**, stored locally in
`chrome.storage.local`. Open it from the gear icon in the panel header or the
extension's options page. This page documents every control.

![Settings — General card](images/placeholder.png)

## General

| Control | Purpose |
|---|---|
| **Instance URL** | Your ServiceNow instance, e.g. `https://devXXXXX.service-now.com`. Always validated as `https://`. |
| **Default ticket type** | Incident, Change Request, Problem, Requested Item (RITM), or Catalog Task (SCTASK). |
| **Queues** | One assignment-group **name** per chip. Every pull is scoped to these groups by name (must match the group's display name in ServiceNow; matching is case-insensitive). Type a name and press Enter, or paste several separated by commas/newlines. |
| **Team members** | One full **name** per chip. Used **only** to detect acknowledgement dates (when a ticket is assigned to one of these people). Leave empty to skip acknowledgement detection. |

Queues and members are plain names because the tool never reads `sys_user`,
`sys_choice`, `sys_user_group`, or `sys_user_grmember` — so restricted accounts
still work. See [Authentication Chain](Authentication-Chain) for the
no-permission design.

## Pull parameters

![Settings — Pull parameters card](images/placeholder.png)

| Control | Range / default | Purpose |
|---|---|---|
| **Table page size** | 100–5000, default 1000 | Rows per Table API page during pulls. |
| **Query cache TTL (minutes)** | 0–10080, default 15 | How long a pulled ticket list is reused without re-fetching. A pull reuses cached results only if the same query ran within this window; `0` disables caching so every pull hits the API. The timeline cache is unaffected. |
| **Max tickets per filter set** | 0–100000, default 500 | Safety cap: if a filter matches more tickets than this, the set is skipped and you are warned instead of pulling. `0` = unlimited. Preview shows the same warning before you run. |
| **Log response data (debug)** | off | Adds a truncated body preview and row count for every API call to the log. Verbose — enable only while troubleshooting. |
| **Clear pull cache** | button | Clears cached query results and timelines. Does **not** touch the classification cache or the ML model. |

The caching behaviour behind these controls is detailed in
[Caching](Caching).

## Classification

![Settings — Classification card](images/placeholder.png)

| Control | Purpose |
|---|---|
| **Classification mode** | **Hybrid** (offline scorer first, then ML when it finds a better answer), **ML only** (machine learning for every ticket), or **Heuristic only** (built-in offline scorer, no ML). |
| **Model** | Which classifier to download: MobileBERT (25.7 MB), DistilBERT (64.5 MB), or NLI DeBERTa v3 (233 MB). Larger models are more accurate but take longer to download. |
| **Download model** | Fetches and caches the selected model's files locally for offline use. |
| **Cache classification results** | Stores each classified note's outcome so an unchanged note is never re-inferred on reload or across datasets. Turn off to always re-classify. |
| **Clear classification cache** | button | Empties the per-note result cache. |

See [Classification](Classification) for how the modes and cascade work, and
[Caching](Caching) for the classification and model caches.

## MSR option lists

![Settings — MSR option lists card](images/placeholder.png)

The allowed values for the report dropdown columns (BA AO sheet). The data view
restricts these columns to the lists here, and both the WSR export and **Copy
for MSR** use exactly these labels. One value per chip. Lists include: Op Co,
Domain, Type, Status, Resolution type, Duplicate incident, Queue names, Sub
category, and Root
cause category for Incident / RFS / P Ticket.

- **Restore MSR defaults** resets to the original `msr.xlsx` values.
- The RFS root-cause list is empty in the source `msr.xlsx` — add values here if
  you raise RFS tickets.

## Classifier keywords

Word and phrase hints the built-in offline scorer uses to match MSR labels while
classifying the resolution notes (regex phrase, keyword hints, then vocabulary
similarity). Each label shows its built-in default keywords; add chips to extend
them or clear them to remove a match. Matching is case-insensitive and tolerates
small misspellings. Editing a label's keywords re-runs classification in the
data view. **Restore default keywords** resets them.

## Backup / transfer

Exports one JSON file with the instance URL, queues, team members, pull params,
saved filters, column mapping, CI split groups, hidden view columns, MSR option
lists, and the cached Excel template. Import replaces all of those with the
file's values. See [Backup and Transfer](Backup-and-Transfer).

## Reset

**Reset all to defaults** (bottom of the page) restores every setting.

---
Related: [Quick Start](Quick-Start) · [Classification](Classification) ·
[Caching](Caching) · [Backup and Transfer](Backup-and-Transfer)
