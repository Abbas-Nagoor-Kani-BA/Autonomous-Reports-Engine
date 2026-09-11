# Autonomous Reports Engine

A Chrome (Manifest V3, side-panel) extension that pulls ServiceNow ticket
timelines, analyzes SLA performance, classifies resolution notes, and exports a
filled Excel (MSR) analysis workbook — running offline and reusing your existing
ServiceNow browser session (no API keys).

## Features

- **Session-based pull** — reads incident / RFS / problem / sc_task tickets via
  the ServiceNow Table API, reusing your logged-in browser tab. No credentials
  are stored and no API keys are needed.
- **Queue timelines & SLA** — reconstructs each ticket's assign, acknowledge,
  suspend and resume moments from its audit history and derives SLA metrics,
  always on the instance clock.
- **Automatic classification** — fills the MSR *Root cause category* and
  *Solution type* from closure notes using a built-in offline scorer, with an
  optional local machine-learning model (Transformers.js) that is downloaded
  once and then runs entirely offline.
- **Data viewer** — column-scoped search, a column editor for fast bulk edits of
  a single column across the current view, CI split preview, ticket stats, and
  Calclens, which explains how each derived value was computed.
- **Excel export** — fills a template MSR workbook and offers a Copy-for-MSR
  action for pasting into an existing sheet.

## How it works

The pipeline runs in two phases:

1. **Phase 1** — a paginated ticket list from the Table API.
2. **Phase 2** — the per-ticket activity feed (`list_history.do`), replayed in
   chronological order to compute the timeline and SLA values.

Requests reuse the session of an open, logged-in ServiceNow tab: the extension
finds the tab, obtains the CSRF token, and relays the request through the tab's
content script so cookies are sent first-party (required under MV3). Scoping
data — queues and team members — is configured by name in Settings rather than
looked up, so the tool needs no extra ServiceNow permissions.

The codebase is layered (`core` → `data` → `services` → `components` →
`surfaces`) and wired by a small dependency-injection container. See
[`docs/architecture.md`](docs/architecture.md) for the full design and
[`docs/timeline.md`](docs/timeline.md) for the timeline, SLA and timezone rules,
and [`docs/time-handling.md`](docs/time-handling.md) for how timestamps flow from
UTC to the instance clock.

## Requirements

- Node.js 22+
- Google Chrome (or Chromium)
- Access to a ServiceNow instance you can log into in the browser

## Install (load unpacked)

The repository sources are TypeScript, which Chrome cannot load directly.
**Always load a built folder**, never the repository root.

```bash
npm install
npm run build        # outputs dist/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the **`dist/`** folder.

For day-to-day development, use `npm run dev` (rebuilds `dev/` on change) and
load the `dev/` folder instead.

## Quick start

1. Open **Settings** and set your ServiceNow instance URL, ticket type, the
   queues to pull, and the team member names.
2. Open your ServiceNow instance in a browser tab and log in.
   **Refresh that tab after loading or reloading the extension** — the content
   script that relays requests must be present.
3. Open the side panel → **Connect** → **Preview** (count) → **Run**.
4. Open the **Data View** to search, edit, classify, and **Export**.

Keep the ServiceNow tab open during a pull and export; requests and the file
download rely on it.

## Configuration

All configuration lives in **Settings**:

- **Instance & scope** — instance URL, ticket type, queues, and team members.
  Queues and members are plain names (case-insensitive); the tool never reads
  `sys_user`/`sys_choice` tables, so restricted accounts still work.
- **Classification** — mode (Heuristic only / Hybrid / ML only), the ML model to
  download, and whether to cache classification results. Switching the mode
  re-classifies the loaded data automatically.
- **MSR option lists & keywords** — the allowed values for the MSR dropdown
  columns and the per-category keyword hints the classifier matches against.
- **Backup** — export/import all settings as a JSON file. Imports accept both
  the current format and backups from the previous project name.

## Classification

Root cause category and solution type are derived from the closure notes with a
label-directed cascade:

1. If the note has an explicit `Root Cause Category:` or `Resolution Type:`
   section, the value there is categorized first.
2. Otherwise the whole note is categorized.

The offline scorer combines exact-phrase (regex), fuzzy keyword, and TF-IDF
cosine matching, ignores negated cues (for example "no workaround needed" does
not score *Workaround*), and resolves competing matches by specificity.

The classification **mode** decides how the offline scorer and the ML model
combine:

- **Heuristic only** — the offline scorer alone; the ML model is never used.
- **Hybrid** — the scorer is authoritative and runs first; the ML model then
  fills only the cells the scorer left blank and never overrides or erases an
  existing value.
- **ML only** — the ML model is authoritative. It evaluates every eligible
  (closed Incident/RFS) row, **replaces** existing values with the model's
  verdict, and **clears** a cell when the model produces no label. Switching the
  model therefore changes the results.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Build to `dev/` and rebuild on change |
| `npm run build` | Production build to `dist/` |
| `npm run zip` | Package `dist/` for distribution |
| `npm run typecheck` | TypeScript checks (base + strict configs) |
| `npm run lint` | ESLint |
| `npm test` | Offline test suites (`node --test "tools/*-test.*"`) |
| `npm run release` | typecheck + lint + test + build |

Tests are plain `node --test` suites that run offline; each component has its
own test, and `tools/viewer-dom-test.ts` drives the viewer end to end with
happy-dom. Conventions (ES2022, explicit `.ts` import specifiers, no
`enum`/`namespace`, the build-once/patch-always component contract) are
documented in [`AGENTS.md`](AGENTS.md).

## Privacy & security

Pulled ticket data and settings are stored locally in the browser. The
extension makes no third-party calls with your data: ServiceNow requests go
through your authenticated tab, and the ML model runs entirely offline after its
one-time download. Host permissions are limited to ServiceNow and the model
download host.
