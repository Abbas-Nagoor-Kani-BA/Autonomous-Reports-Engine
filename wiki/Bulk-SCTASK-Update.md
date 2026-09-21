# Bulk SCTASK Update

Bulk-post **Comments** and **Work notes** to the SCTASKs assigned to you (or your
groups) in one pass. Open it with **Bulk update SCTASKs** under **Bulk actions**
in the panel.

This is the extension's **first write path** to ServiceNow. Everything else in
the tool is read-only; this page appends journal entries to real records, so it
previews every change and confirms before posting.

![The bulk SCTASK page](images/placeholder.png)

## The list

- **Scope** — choose **Assigned to me** or **Assigned to my groups**. Changing
  the scope reloads the list.
- **Columns** — Number, Short description, State, Assignment group, Assigned to,
  Updated, plus the editable **Comments** and **Work notes** columns.
- **Number is a link** — it opens the SCTASK in ServiceNow in a new tab.
- **Work notes are fetched with the list.** The last work note and the "has a
  work note?" flag are derived from the record's `work_notes` on the initial
  list call — there are **no per-ticket read round-trips**.
- **Truncated cells show the full text on hover** (tooltip). Cells that hold no
  override text show a `—` placeholder.

## Search and selection

- **Search matches ALL columns** (case-insensitive substring).
- **Select-all** (the header checkbox) toggles only the **visible** (filtered)
  rows.
- **Selection persists across filter changes** — narrowing the search never
  drops tickets you already selected.

## Entering per-ticket text

There are **no shared text boxes**. Each ticket carries its own Comments and
Work notes text. Click a ticket's **Comments** or **Work notes** cell to open the
edit popup, which shows:

- The ticket's read-only details (Number, Short description, State, Assignment
  group, Assigned to, Updated).
- The **full work-notes history** — every previous journal entry, newest first,
  in a collapsible, scrollable accordion (each entry shows its timestamp and
  author).
- The **Comments** (customer-visible) and **Work notes** (internal) inputs for
  this ticket.

**Save** stores the text as that ticket's override (shown in its column, with the
full value on hover); **Clear override** removes it.

## Helpers

- **Pull last work notes** — fills the selected tickets' **Work notes** input
  with their latest existing work note (taken from the data already loaded, no
  API call). A ticket's existing Comments text is preserved.
- **Flag tasks with no work note** — flags every listed ticket that has no work
  note (a "No work note" badge appears next to its number) and enables
  **Select flagged**.
- **Select flagged** — **adds** the flagged tickets to the current selection
  (union; it never clears what you already picked).

## Preview, confirm, and post

**Preview & Update** opens the confirm modal, which lists each selected ticket's
resolved Comments/Work notes text.

- **Empty-selection warning** — if some selected tickets have no text, a prompt
  says how many will be skipped; you can proceed (posting only the tickets that
  have text) or cancel. If **none** of the selected tickets have text, nothing is
  posted.
- **Edit from the preview** — each ticket number in the preview is clickable and
  opens the same edit popup. Saving updates both the table and the preview row in
  place, so they stay in sync (only while confirming, before posting starts).
- **Post** — writes each ticket's own text. Rows flip live from pending to
  ✓ (ok) or ✗ (failed) as each write completes, and a summary shows
  `N succeeded · M failed`.
- **Retry failed** — re-posts only the tickets that failed.

## How the write works

- Journal fields (`comments`, `work_notes`) **append** on ServiceNow — posting
  never overwrites existing entries.
- Writes are **sequential**, one ticket at a time, to stay within rate limits and
  to report per-row progress.
- The write is a `PATCH` to `sc_task`, relayed through the logged-in ServiceNow
  tab's content script with the `X-UserToken` CSRF token (same
  [authentication chain](Authentication-Chain) as reads).

### Why work notes are read off the record

`sys_journal_field` is ACL-blocked for many users, so the list reads `work_notes`
directly off the `sc_task` record with `sysparm_display_value=true`. ServiceNow
returns every entry concatenated newest-first, each introduced by a header like
`DD-MM-YYYY HH:mm:ss - Author (Work notes)`; the page parses that display value
into the newest note, the "has a note" flag, and the full history shown in the
edit popup.

---

Related: [Authentication Chain](Authentication-Chain) ·
[Data Viewer](Data-Viewer) · [Configuration](Configuration)
