# Testing

Tests are plain `node --test` suites that run **offline**. `npm test` runs them
all:

```bash
npm test          # node --test "tools/*-test.*"  (the glob is required)
```

The full gate is:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm run release` runs the exact same gate — it is what the release workflow
invokes. See [Release Process](Release-Process).

## Suites

| Suite | Covers |
|---|---|
| `phase2-unit-test.js` | the four timeline rules |
| `querybuilder-test.js` | encoded-query construction |
| `report-test.js`, `slasummary-test.js` | report and SLA derivation |
| `durations-test.js` | derived durations from the four rules' UTC timestamps |
| `ai-parse-test.js` | closure-note regex extraction |
| `activity-client-test.js`, `activity-parse-test.js` | activity feed source and parsing |
| `journal-test.js`, `rowmerge-test.js`, `tz-unit-test.js` | journal parsing, row merge, timezone units |
| `pull-cache-test.ts`, `per-row-cache-test.js` | cache policy through the repositories |
| `idb-test.ts` | the real IndexedDB path via fake-indexeddb |
| `di-test.ts`, `repository-test.ts`, `pull-service-test.ts`, `settings-service-test.ts` | DI and services against fakes |
| `extract-service-test.js`, `report-service-test.js`, `export-service-test.js` | viewer-bound services (fmt→SLA coupling, export building) |
| `template-export-test.js` | template XML patching / sheet lookup |
| `attention-test.js`, `calclens-test.js` | Calclens "needs attention" rule engine |
| `calclens-highlights-test.ts`, `calclens-highlights-menu-test.ts` | Calclens highlight toggles (state + dropdown UI) |
| `msrchoices-test.js`, `msrcategorize-test.js` | MSR choice maps and categorization |
| `classifier-service-test.js`, `classification-cache-test.js`, `classify-cache-test.js`, `classify-fallback-test.js`, `ml-model-repository-test.js` | ML classification services, cache, and model repository |
| `remote-bridge-test.ts` | the remote bridge |
| `panel-components-test.ts`, `data-grid-test.ts`, `search-picker-test.ts`, `modal-test.ts`, `map-dialog-test.ts`, `settings-chips-test.js` | components |
| `viewer-dom-test.ts` | end-to-end viewer flow (happy-dom) |
| `search-state-test.ts`, `search-match-test.ts` | column-scoped search: state owner + pure matcher |
| plus assorted units | `ci-split-test.js`, `pick-exact-test.js`, `path-from-url-test.js`, `store-test.js`, `icons-test.ts`, `action-rail-test.ts`, `edit-mode-state-test.js`, `column-editor-*` |

## Every component needs its own test

The viewer DOM test drives the grid through the viewer modules and **cannot**
validate a component's own contract — it stayed green through three separate
component-level bugs (an unseeded picker list, three `DataGrid` width/state
bugs, and Escape not closing two of four overlays). End-to-end coverage is not
enough; add a component-level test for every component. See
[Component Contract](Component-Contract).

## Live timezone check (not part of npm test)

```bash
TZ_INSTANCE=… TZ_USER=… TZ_PASS=… node tools/tz-live-check.js
```

Verifies rendered times against ServiceNow's display values. It needs live
credentials, which is why it is a `-check` and not a `-test` — `npm test` must
stay offline. See [Timezone Contract](Timezone-Contract).

---
Related: [Building and Running](Building-and-Running) ·
[Component Contract](Component-Contract) · [Caching](Caching)
