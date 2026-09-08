# Quick Start

This walks you from a freshly installed extension to your first exported report.
If you have not installed it yet, see [Installation](Installation) first.

## 1. Configure scope in Settings

Open **Settings** (the gear icon in the panel header, or the extension's options
page) and set:

- **Instance URL** — e.g. `https://devXXXXX.service-now.com`.
- **Default ticket type** — Incident, Change Request, Problem, RITM, or SCTASK.
- **Queues** — one assignment-group **name** per chip. Every pull is scoped to
  these groups. Names must match the group's display name in ServiceNow
  (matching is case-insensitive).
- **Team members** — one full **name** per chip. Used only to detect
  acknowledgement dates. Leave empty to skip acknowledgement detection.

The tool never reads `sys_user` or `sys_choice` tables, so restricted accounts
still work. See [Configuration](Configuration) for every setting.

![Settings — General card](images/placeholder.png)

## 2. Log in to ServiceNow and refresh the tab

1. Open your ServiceNow instance in a browser tab and **log in**.
2. **Refresh that tab after loading or reloading the extension.** The content
   script that relays requests must already be present, or the pull fails fast
   with a clear message.

Keep this tab open during pulls and exports — requests and the file download
rely on it.

## 3. Connect, preview, run

In the side panel:

1. Confirm the **Instance URL** and click **Connect** (local validation only).
2. Set the **ticket type** and any **conditions**.
3. Click **Preview** to get a count of matching tickets.
4. Click **Run** to pull. Progress shows Phase 1 (the ticket list) and Phase 2
   (per-ticket timelines).

![Panel — running a pull](images/placeholder.png)

See [Running a Pull](Running-a-Pull) and
[Filters and Presets](Filters-and-Presets) for the full workflow.

## 4. View, classify, export

1. Click **Open data view**.
2. Search and edit with the [Data Viewer](Data-Viewer); check derived values
   with [Calclens](Calclens).
3. Root cause and solution type are filled from the closure notes — see
   [Classification](Classification).
4. **Export** the MSR workbook or use **Copy-for-MSR** — see [Export](Export).

---
Related: [Installation](Installation) · [Running a Pull](Running-a-Pull) ·
[Configuration](Configuration)
