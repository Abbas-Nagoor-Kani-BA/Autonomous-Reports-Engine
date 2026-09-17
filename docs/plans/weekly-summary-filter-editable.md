# Plan — Editable Weekly Summary change-request filter

## Problem Statement

The Weekly Summary change-request pull is invisible. When "Pull change requests
for Weekly Summary" is checked, the app fires two hardcoded `change_request`
queries inside `#pullChangeSummary` (`services/pull-service.ts`): last week by
`end_date`, next week by `start_date`, scoped to the configured queues, with the
week windows computed from `weekRanges()`. Users cannot see what will be pulled
and cannot adjust it.

Surface this filter as human-readable text directly below the checkbox, add an
**Edit** button that opens the existing condition builder pre-loaded with the
two windows, and change the primary action label to **"Save weekly summary"** in
that mode. The pull then consumes the (possibly edited) stored windows instead
of hardcoded values.

## Requirements (confirmed with user)

- Target the hidden Weekly Summary change-request pull only.
- Editable as full condition rows in the shared condition builder, but the date
  windows are always provided/defaulted.
- Show as filter-list-style text below the "include summary" checkbox, with an
  Edit button next to it.
- Edit opens the same condition builder used for other ticket types; primary
  button label becomes "Save weekly summary" instead of "+ Add to filter list".
  Entering edit mode replaces whatever is currently in the builder (no
  stash/restore).
- Persistence: defaults recompute from `weekRanges()` each week; storing a user
  edit sets an override that stops auto-advancing until reset.
- **Start/end dates are editable, but they MUST be present in the saved filter.**
  Save validates that each window still carries its date-range condition with
  valid from/to values and refuses to save otherwise. A saved weekly-summary
  filter can never lose its dates.

## Guardrails

- The two-window structure and the `end_date` (last week) / `start_date` (next
  week) `between` anchors are load-bearing: the Weekly Summary sheet math in
  `core/summary/summarydetails.ts` depends on them. Editing conditions/dates is
  allowed; removing the date anchors is not.

## Task Breakdown

- [ ] Task 1: Pure weekly-summary window model + defaults
  - `core/summary/change-summary-filter.ts`: two-window type,
    `defaultChangeSummaryWindows(now)` from `weekRanges()`,
    `resolveChangeSummaryWindows(stored, now)` (defaults unless `overridden`),
    `encodeChangeSummaryWindow(window, groupNames)` reproducing today's queries.
  - Tests: defaults byte-identical to current hardcoded queries for a fixed
    `now`; override passthrough; queue-scope + date encoding unchanged.

- [ ] Task 2: ChangeSummaryRepository + token + storage key
  - `STORAGE.changeSummaryFilter`, `CHANGE_SUMMARY_REPO` token,
    `ChangeSummaryStore` (KeyValueStore-backed, mirrors `FilterListStore`),
    registered in `di/register-core.ts`.
  - Tests: load-empty, save/reload, clear, malformed-data tolerance.

- [ ] Task 3: PullService consumes provided windows (behavior-preserving)
  - `PullRequest.changeSummaryWindows?`; `#pullChangeSummary` uses resolved
    windows when provided, else falls back to `weekRanges()`. Thread through
    `background.ts` RUN handler and `RemoteBridge.run` + message types.
  - Tests: no windows -> queries identical to today; override -> reflected;
    remote-bridge forwards the field.

- [ ] Task 4: Panel summary text + Edit button (read-only first)
  - `panel.html`: text below `includeSummary` showing each window
    (filter-list-style), an **Edit** button, and a **Reset to this week's
    dates** link shown only when overridden. `panel.ts`: load from repo,
    render, re-render on `chrome.storage.onChanged`.
  - Tests: text renders from stored/default windows; Edit button present.

- [ ] Task 5: Condition-builder "summary edit mode" + button relabel
  - Panel-level mode flag. Edit replaces builder contents
    (`setTable("change_request")` + `setRows(filterSetToRows(...))`), relabels
    `#addFilterBtn` to "Save weekly summary", repurposes its handler. Present
    both windows (segmented control: Last week / Next week), each with its date
    row always present and pre-filled with explicit date inputs. Cancel/exit
    restores main mode.
  - Tests: entering mode loads change_request rows, button reads "Save weekly
    summary", both windows editable with dates defaulted; exit restores label.

- [ ] Task 6: Save path — persist as override, enforce dates-present guardrail
  - Validate each window via `conditions()`; enforce that each window carries
    its `end_date`/`start_date` `between` anchor with valid from/to dates;
    refuse to save with a clear message if missing/empty. Persist
    `{ lastWeek, nextWeek, overridden: true }`; exit mode; refresh text; toast.
    Reset clears the override.
  - Tests: edit+save+reload shows override; reset returns to defaults; guardrail
    rejects a window missing/empty dates.

- [ ] Task 7: Wire override into preview/run + docs + full gate
  - `panel.ts`: include resolved `changeSummaryWindows` in `bridge.run` when
    `includeSummary` checked (optional: count them in Preview). Update
    `AGENTS.md` hidden-CR note and `wiki/Filters-and-Presets.md`.
  - Tests: `npm run typecheck && npm run lint && npm test && npm run build`;
    add `node --check` targets for new files.

## Notes / risks

- Two-window + end_date/start_date anchoring is a hard guardrail for Summary
  sheet correctness. Free-form removal of the date anchors is out of scope.
- Preview counting of change requests is optional (Task 7).
