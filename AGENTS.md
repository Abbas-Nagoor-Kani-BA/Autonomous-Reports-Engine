# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project Overview

Chrome extension (Manifest V3, Side Panel UI) that pulls incident tickets from a
ServiceNow instance via REST, extracts per-ticket queue timelines, and exports an
Excel (.xlsx) analysis workbook.

- Target instance: `https://dev385266.service-now.com` (developer instance, admin role)
- Auth model: reuses the user's browser login session. No API keys or Basic auth.
- Two-phase pipeline: Phase 1 = paginated ticket list; Phase 2 = audit-history timelines.

**The codebase is a layered architecture: `core/` → `data/` → `common/` →
`viewer/` | `panel/` | `settings/`, wired by a DI container in `di/`. Each
surface is self-contained: its HTML page, entry module, composition root,
surface-specific components, and surface-specific services all live in one
folder. Shared components and services live in `common/`. Read
[`docs/architecture.md`](docs/architecture.md) before adding code — it defines
the directory map and what each layer may and may not do.**

All application source is TypeScript (`.ts`); esbuild strips the types. The only
`.js` sources are `content/content.js` and the `tools/` scripts.

## Component contract

Components extend `common/components/component.ts`. Two rules are load-bearing and both
were found the hard way — see the file's own documentation:

- **`build()` runs once; `patch()` runs on every state change.** A full rebuild
  per change destroys input focus and caret position. The condition builder
  compares row _shapes_, not values, so typing never re-renders its rows.
- **Subclasses must not use instance fields or `#private` methods from `build()`
  or the first `patch()`.** Both are installed on the instance only after
  `super()` returns, but the base constructor calls `build()`. A field reads as
  `undefined`; a `#private` method call throws
  `TypeError: Receiver must be an instance of class ...`. Helpers called during
  build must be `protected` prototype methods.

Elements that are siblings rather than children (the log modal, `#count`,
`#slaBar`, the add-condition button) arrive through `deps`, not `q()`.

## DI container

`di/token.ts` gives branded string tokens; `di/tokens.ts` is the registry
(every import is `import type`, so the registry emits no runtime references and
the graph stays acyclic). Classes take dependencies as constructor arguments and
declare them as a `static deps` array of tokens — esbuild cannot emit decorator
metadata, so reflection-based DI is unavailable.

No decorators, no service locator (except `RUN_SCOPE_FACTORY`, which exists
because `SN_REMOTE` is bound to one instance URL per pull).

Singletons are cached **per container**, so a `child()` can override a
dependency — that is what makes tests able to inject fakes. See
`di/container.ts`.

## Critical Knowledge (do not regress)

### Authentication chain (`data/datasource/sn-transport.ts`)

Requests MUST go through this order:

1. Find an open tab matching the instance origin. **No tab → fail fast with a
   clear message** (session auth is impossible without it).
2. Get CSRF token: try `g_ck` cookie via `chrome.cookies`; if absent, inject a
   MAIN-world script reading the page global `g_ck`.
3. Relay through the tab's content script (same-origin fetch, cookies first-party).
4. Direct `fetch` from the service worker is last-resort only.

Why this shape (hard-won):

- MV3 service-worker fetches are cross-site: third-party cookie blocking breaks session cookies.
- Content scripts run in an **isolated world** — they CANNOT see page globals like `g_ck`.
- On current releases there is no reliable `g_ck` cookie; the token lives as a JS variable in page context.
- ServiceNow rejects session-authenticated API calls missing `X-UserToken` with 401.
- Users must refresh their ServiceNow tab after reloading the extension, or the content script won't exist yet.

### No-permission design (hardcoded scope)

The default flow makes ZERO metadata lookups: no `sys_choice`, `sys_user_group`,
`sys_user_grmember`, or `sys_user` reads — no such resolver methods exist. Some
users lack permission for those tables, so all scoping data is hardcoded in
settings instead:

- Queues and team members = plain NAME strings in `pluginSettings.defaults`
  (one name per line in the options page; matching is case-insensitive).
- State/priority labels come from `core/statechoices.ts` OOB maps.

Only the selected ticket table plus the per-ticket activity feed
(`list_history.do`) are read during pulls. COUNT/RUN are the only server
operations; the panel's Connect is local-only validation.

**One opt-in exception (never on the default path):** the Settings scope
resolvers. A **"Resolve queues"** button reads the current user's active group
memberships (`sys_user_grmember` joined to `sys_user_group`) and fills the
Queues list. Each queue row then has a per-queue **"resolve members"** button
that reads that one group's active members (`sys_user_grmember` joined to
`sys_user`, dot-walked `user.name`/`user.active`) and opens a confirmation
dialog (checkbox list) so the user picks which names to merge into Team members.
A second per-queue **"resolve CIs"** button reads the configuration items that
group supports (`cmdb_ci` where `support_group` is that group, dot-walked
`name`) and opens the same picker so the user merges chosen CIs into a
**Configuration items** settings list (`defaults.configItems`); the viewer's CI
split dialog unions that stored list into its available pool so users pick/search
resolved CIs instead of hand-typing.
The per-group member/CI reads are deliberately single-page: when they hit the
page cap the dialog shows a truncation notice instead of silently dropping rows
(large "assigned to everyone" groups overflow and are not paginated). These are
driven by `services/scope-resolve-service.ts` (`resolve` / `resolveGroupMembers`
/ `resolveGroupConfigItems`) → `SnRemote.resolveUserScope` /
`resolveGroupMembers` / `resolveGroupConfigItems`
(`data/datasource/sn-remote.ts`) → the metadata queries in `lib/servicenow.ts`
(`fetchRecords` / `fetchGroupMemberRows` / `fetchGroupCiRows` / `currentUserId`),
with the current-user identity read from the tab's MAIN world (`getPageUser` in
`data/datasource/sn-transport.ts`, reading `NOW.user` / `g_user` / `g_user_id`)
or the current-user REST endpoint. On any permission failure (401/403) it fails
gracefully with an "add them manually" message and changes nothing. COUNT/RUN
never call them, so restricted users who never press the buttons are unaffected.

### The Bulk SCTASK write path (`sctask/`, the only write path)

Everything else in the tool is read-only. The Bulk SCTASK page
(`sctask/index.ts`, `list-view.ts`, `confirm-modal.ts`, `overrides.ts`;
`services/sctask-bulk-service.ts`; routed through `platform/background.ts` +
`common/services/remote-bridge.ts`) is the **only** code that writes to
ServiceNow. Load-bearing facts:

- **Writes are `PATCH` to `sc_task`** through the same auth chain as reads
  (relay via the logged-in tab's content script with `X-UserToken`). The
  transport (`data/datasource/sn-transport.ts`) and content relay carry
  `method`/`body`/`Content-Type`.
- **Journal fields append.** `comments` and `work_notes` always append on
  ServiceNow — the write never overwrites. Each selected ticket posts its OWN
  resolved text (per-ticket overrides; there are no shared text boxes).
- **Writes are sequential**, one ticket at a time, for rate limits and per-row
  progress (streamed as stage `sctaskRow` → `ConfirmModal.markRow`).
- **`sys_journal_field` is ACL-blocked** for many users, so work notes are read
  OFF the record: the list call fetches `work_notes` with
  `sysparm_display_value=true` and `parseWorkNotes` / `parseLastWorkNote`
  (`lib/servicenow.ts`) split the concatenated display value (headers look like
  `DD-MM-YYYY HH:mm:ss - Author (Work notes)`, newest first) into the history +
  newest note — **no per-ticket read round-trips**.
- **`current_user` returns the id as `result.user_sys_id`** (not `sys_id`);
  `currentUserId()` tolerates several shapes.
- The layers are intentionally reusable for a future bulk-assignment feature.

### The four timeline rules (business requirements — never change semantics without asking)

Computed in `core/phase2.ts` from timeline events (`assignment_group`,
`assigned_to`, `state`), replayed in chronological order:

1. **assignTime** — LAST time `assignment_group` changed TO the target queue.
   Born-in-queue fallback: if NO group-change events exist but the ticket's
   CURRENT group == queue, assignTime = opened_at. assignTime is CLAMPED to
   never precede opened_at; the clamp does not affect ackn eligibility. Each
   ticket is measured against ITS OWN current group, and ackn checks membership
   of that queue's member set (the flat configured team-member list applied to
   every selected queue).
2. **acknTime** — LAST time `assigned_to` became a member of the queue's team,
   counted ONLY if it occurs at/after the latest queue-entry event.
3. **suspendTime** — FIRST transition INTO "On Hold" while current group == queue.
   State labels come from `core/statechoices.ts`. Feed events carry DISPLAY
   LABELS ("On Hold"); legacy sys_audit rows carried raw values ("3") — both are
   accepted.
4. **resumeTime** — FIRST post-suspend transition to "In Progress"; if none, fall
   back to first post-suspend "Resolved". Null if never resumed.

On Hold transitions while assigned elsewhere do NOT count. Group changes reset
queue context.

### Performance constraints

- Phase 2 reads the activity feed PER TICKET — no batching exists; keep per-ticket progress reporting.
- Table API pages of 1000. Exports can reach Excel's 1,048,576-row ceiling.
- Keep the ServiceNow tab open during exports (relay + node affinity).

### Timezone contract

- ServiceNow REST raw datetimes are UTC; `parseUtc()` appends Z before parsing.
- All displayed times must follow the INSTANCE clock, never the browser. The
  only reliable oracle is SN's own display/raw pair per record.
- The viewer's `fmtInstant(v, row)` resolves each row's OWN offset from its
  openedAt display/raw pair, so rows spanning DST seasons stay correct.
- **The grid passes `fmtInstant` INTO `buildReport`, which uses it to normalise
  dates. A non-identity formatter therefore changes derived SLA results, not
  just displayed text.**

See [`docs/timeline.md`](docs/timeline.md) for the full timeline and SLA rules.

### Export sheet lookup

Sheet lookup normalizes names (`_`/space/case-insensitive, exact then loose) and
NEVER silently falls back to another sheet — a wrong-sheet fill once emptied a
user's report. If formula rows get deleted, strip `xl/calcChain.xml` and set
`fullCalcOnLoad="1"` on `<calcPr>`, or Excel raises its repair dialog. The
service worker never touches XLSX bytes; see the Download path note in
[`docs/architecture.md`](docs/architecture.md).

## Verification Commands

There is no bundler or package manager for tests. Verify with node after every
change:

```bash
node --check platform/background.ts core/*.ts lib/*.ts viewer/*.ts panel/*.ts settings/*.ts content/content.js && \
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
```

`npm run typecheck` (tsconfig.json + tsconfig.strict.json) is meaningful — keep
it at 0 errors; `npm run lint` likewise. `npm test` runs the offline suites
(`node --test "tools/*-test.*"`; the glob is required). Code style is enforced
by Prettier: `npm run format` writes, `npm run format:check` verifies (config in
`.prettierrc.json`, exclusions in `.prettierignore`). `eslint-config-prettier`
is the last entry in `eslint.config.mjs` so ESLint never fights the formatter.

Full gate:

```bash
npm run format:check && npm run typecheck && npm run lint && npm test && npm run build
```

`npm run release` runs the exact same gate — it is what the GitHub release
workflow (`.github/workflows/release.yaml`) invokes.

Pure modules in `core/` are ES modules and run standalone in plain node, e.g.:

```js
import { extractTimelines } from "./core/phase2.ts";
```

Regression suites (`npm test` runs all of them):

| Suite                                                                                                                                              | Covers                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `phase2-unit-test.js`                                                                                                                              | the four timeline rules                                                                                                                                |
| `querybuilder-test.js`                                                                                                                             | encoded-query construction                                                                                                                             |
| `change-summary-filter-test.ts`                                                                                                                    | Weekly Summary change-request window model (defaults from `weekRanges()`, override resolution, encode byte-identical to the legacy two-window queries) |
| `change-summary-repository-test.ts`                                                                                                                | the persisted Weekly Summary filter override (`STORAGE.changeSummaryFilter`)                                                                           |
| `report-test.js`, `slasummary-test.js`                                                                                                             | report and SLA derivation                                                                                                                              |
| `durations-test.js`                                                                                                                                | derived durations from the four rules' UTC timestamps                                                                                                  |
| `ai-parse-test.js`                                                                                                                                 | closure-note regex extraction                                                                                                                          |
| `activity-client-test.js`, `activity-parse-test.js`                                                                                                | activity feed source and parsing                                                                                                                       |
| `journal-test.js`, `rowmerge-test.js`, `tz-unit-test.js`                                                                                           | journal parsing, row merge, timezone units                                                                                                             |
| `pull-cache-test.ts`, `per-row-cache-test.js`                                                                                                      | cache policy through the repositories                                                                                                                  |
| `idb-test.ts`                                                                                                                                      | the real IndexedDB path via fake-indexeddb                                                                                                             |
| `di-test.ts`, `repository-test.ts`, `pull-service-test.ts`, `settings-service-test.ts`                                                             | DI and services against fakes                                                                                                                          |
| `extract-service-test.js`, `report-service-test.js`, `export-service-test.js`                                                                      | the viewer-bound services (fmt→SLA coupling, export building)                                                                                          |
| `template-export-test.js`                                                                                                                          | template XML patching / sheet lookup                                                                                                                   |
| `attention-test.js`, `calclens-test.js`                                                                                                            | Calclens "needs attention" rule engine                                                                                                                 |
| `calclens-highlights-test.ts`                                                                                                                      | Calclens highlight-toggle owner (persisted enabled set)                                                                                                |
| `calclens-highlights-menu-test.ts`                                                                                                                 | Calclens highlight-toggle dropdown UI (checkbox list, Show/Hide all, button indicator)                                                                 |
| `msrchoices-test.js`, `msrcategorize-test.js`                                                                                                      | MSR choice maps and categorization                                                                                                                     |
| `classifier-service-test.js`, `classification-cache-test.js`, `classify-cache-test.js`, `classify-fallback-test.js`, `ml-model-repository-test.js` | ML classification services, cache, and model repository                                                                                                |
| `remote-bridge-test.ts`                                                                                                                            | the remote bridge (preview, run, resolveScope, resolveGroupMembers, resolveGroupCis, progress)                                                         |
| `resolve-scope-test.js`                                                                                                                            | pure scope-shaping helpers (group/member/CI extraction, active filtering, name merge/subtract/sort/dedupe)                                             |
| `user-identity-test.ts`                                                                                                                            | current-user id selection (`pickUserId`: REST → page global → user_name → table)                                                                       |
| `resolve-user-scope-test.ts`                                                                                                                       | `SnRemote.resolveUserScope` / `resolveGroupMembers` / `resolveGroupConfigItems` query sequence and shaping (incl. truncation flag)                     |
| `scope-resolve-service-test.ts`                                                                                                                    | `ScopeResolveService` success + graceful permission/empty failure mapping (scope + per-group members + per-group CIs)                                  |
| `settings-scope-merge-test.js`                                                                                                                     | the Settings resolve merge helpers (merge/subtract/sort A–Z, dedupe, idempotent)                                                                       |
| `member-picker-test.ts`                                                                                                                            | per-queue member/CI confirmation dialog (checkbox list, select all/none, truncation notice, title override, Add returns checked only)                  |
| `ci-split-test.js`, `pick-exact-test.js`, `path-from-url-test.js`, `store-test.js`, `icons-test.ts`                                                | assorted units                                                                                                                                         |
| `action-rail-test.ts`                                                                                                                              | draggable/foldable action rail (clamp helper + fold/drag persistence)                                                                                  |
| `edit-mode-state-test.js`                                                                                                                          | edit-mode session toggle owner                                                                                                                         |
| `column-editor-data-test.js`                                                                                                                       | pure column-values selector (entries + focused index)                                                                                                  |
| `column-editor-test.ts`                                                                                                                            | column editor component (right list, type-aware inputs, CI datalist autocomplete, arrow nav, Calclens highlight, find filter)                          |
| `panel-components-test.ts`, `data-grid-test.ts`, `search-picker-test.ts`, `modal-test.ts`, `map-dialog-test.ts`, `settings-chips-test.js`          | components                                                                                                                                             |
| `viewer-dom-test.ts`                                                                                                                               | end-to-end viewer flow (happy-dom)                                                                                                                     |
| `search-state-test.ts`, `search-match-test.ts`                                                                                                     | column-scoped search: state owner + pure matcher (modes, case, all/single-column, displayed-value match)                                               |
| `col-order-test.ts`                                                                                                                                | pure column-order model (`orderColumns`/`reorderKeys`): drag-to-sort reordering, migration-safe merge, hidden-column compose                           |

Manual test loop (user performs): reload extension at `chrome://extensions`
→ refresh the ServiceNow tab → Connect → Preview count → Run export.

`TZ_INSTANCE=… TZ_USER=… TZ_PASS=… node tools/tz-live-check.js` verifies
rendered times against SN's display values. It needs live credentials, which is
why it is a `-check` and not a `-test` — `npm test` must stay offline.

### Builds (loading the repo root unpacked NO LONGER works)

Sources include `.ts` files, which Chrome cannot execute as modules — `.ts` is
served with a non-JavaScript MIME type and the type annotations are not valid
JS. Always load a **built** folder:

- `npm run dev` (or `npm run watch`) → rebuilds `dev/` on change. Load `dev/`
  unpacked. This is the development loop.
- `npm run build` → `dist/` (bundled, mirrors repo layout). Load `dist/`
  unpacked to smoke-test the release shape.
- `npm run zip` → packs `dist/`.

`dev/` and `dist/` are both gitignored. Watch mode must never write into the
repo root: the esbuild entries _are_ the sources, so bundling to ROOT would
overwrite `panel/panel.js` and friends with their own output. `build.mjs`
refuses to build into ROOT, and watch mode targets `dev/`.

## Conventions

- No code comments unless asked; no emojis in output files.
- ES2022 max (MV3 service workers): private `#methods`, top-level `await` avoided.
- **ES modules everywhere**: `package.json` `"type":"module"`; the service
  worker is declared with `"type":"module"`; pages load a single
  `<script type="module">` entry. No IIFE/globalThis attaches, no
  `importScripts`, no `require()`.
- `.ts` files are type-checked, not compiled — esbuild strips the types.
  Import specifiers use **explicit `.ts`** because Node does not rewrite
  `.js` → `.ts`.
- **Avoid `enum`, `namespace` and parameter properties.** Node's type stripping
  cannot transform them; they need `--experimental-transform-types`. ESLint
  bans them.
- Two tsconfigs: the base checks everything non-strictly; `tsconfig.strict.json`
  checks an explicit, growing list of migrated files strictly and sets
  `checkJs: false` so it cannot leak into un-migrated JS.
- Mutable shared state is owned by exactly one module and exposed via accessor
  functions, never via reassigned imports.
- Vendored UMD libs (fflate) stay classic: loaded via `<script>` before the
  page's module entry (pages read `globalThis.fflate`), or via
  `lib/vendor/fflate.cjs` createRequire shim inside node tests (`setFflate()`
  injection for `core/templatexml.ts`).
- All user-facing strings in English; timestamps ISO 8601.
- Never log or store full token values — prefix only (first 8 chars) in diagnostics.
- Instance URL comes from user input/storage; always validate `https://`.

## Testing notes learned the hard way

**The viewer DOM test cannot validate a component's own contract.** It drives
the grid through the viewer modules, and it stayed green through three separate
component-level bugs: an unseeded picker list, three width/state bugs in
`DataGrid`, and Escape silently not closing two of four overlays. Every
component needs its own test; end-to-end coverage is not enough.

## Docs

| File                                                       | Purpose                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)             | Layered architecture, directory map, layering rules, download path. Start here.                                      |
| [`docs/timeline.md`](docs/timeline.md)                     | The four timeline rules, timezone contract, export sheet lookup.                                                     |
| [`docs/time-handling.md`](docs/time-handling.md)           | How timestamps flow UTC→instance clock: representations, offset resolution, pitfalls, and how to test time behavior. |
| [`docs/timeline-scenarios.md`](docs/timeline-scenarios.md) | Full assignTime/acknTime scenario catalogue (multi-queue, acked-stay-wins, equal timestamps).                        |
| [`docs/roadmap.md`](docs/roadmap.md)                       | Known limits and forward-looking work.                                                                               |
