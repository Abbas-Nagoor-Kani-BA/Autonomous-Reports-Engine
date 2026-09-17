# Architecture

The target architecture and the rules that keep it enforceable. Read this
before adding code.

## Layered design

```
core/ → data/ → common/ → viewer/ | panel/ | settings/
```

Wired by a DI container in `di/`. Dependency direction is strictly downward.

## Directory map

All application source is TypeScript (`.ts`); esbuild strips the types. The only
`.js` sources are `content/content.js` and the `tools/` test/build scripts.

```
core/        Pure domain. No DOM, no chrome.*, no I/O. Runs standalone in node.
             phase2 (the four timeline rules), report, slasummary, durations,
             aiextract, querybuilder, sntime, statechoices, names, msrchoices,
             msrcategorize, rowmerge, journal, templatexml, attention, calclens.
data/        Everything that touches storage or the network.
  repositories/  ticket, timeline, settings, dataset, run-state, export-config,
                 viewer-prefs, template, filter-list, msr-lists
  datasource/    sn-transport (session auth), sn-remote (ServiceNow client)
  idb.ts, key-value-store.ts, chrome-key-value-store.ts,
  classification-cache-repository.ts, ml-model-repository.ts
common/      Shared UI units and services used by more than one surface.
  components/    Component (base class), Modal.
  services/      RemoteBridge, SettingsService.
viewer/      The data-view surface. Self-contained: HTML page, composition root,
             and all viewer-specific modules in one place.
  viewer.html
  index.ts             Composition root — calls each module's init*() in order.
  core.ts, store.ts, grid.ts, toolbar.ts, classify.ts, calclens.ts, ...
  components/          Viewer-only UI components:
                       DataGrid, SearchPicker, ColumnEditor, CalclensPanel,
                       CiDialog, MapDialog.
  services/            Viewer-only business logic:
                       ExportService, ReportService, ExtractService.
panel/       The side-panel surface. Self-contained.
  panel.html
  panel.ts             Entry module (esbuild entry point).
  index.ts             Composition root.
  components/          Panel-only UI components:
                       LogCard, ProgressCard, ConditionBuilder, FilterSetList.
settings/    The options-page surface. Self-contained.
  settings.html
  settings.ts          Entry module (esbuild entry point).
  index.ts             Composition root.
  components/          Settings-only UI component: ChipList.
di/          Container, tokens, and the per-surface registration functions
             (container, token, tokens, register-core, register-background).
lib/         Platform and UI helpers: keys, storage, store, markup, picklist,
             servicenow, toast, tooltip, format, icons, icons-data.
services/    Platform-level services not owned by any surface:
             PullService, ConnectionService, QueueScope, ClassifierService.
worker/      Off-thread ML classification: classifier-worker, ml-classify.
platform/    The service worker (background.ts).
content/, types/, styles/, icons/
```

### viewer/index.ts

The viewer page's composition root. Calls each module's `init*()` in a fixed
order and then boots. The modules own the data stores and the export pipeline;
their UI lives in `viewer/components/`.

**Nothing binds DOM handlers at module scope.** Every module exports an
`init*()` and the composition root decides when it runs. Adding top-level
wiring to a viewer module re-introduces the invisible ordering this replaced.

## Layering rules

| Layer                            | May use                              | Must never                                     |
| -------------------------------- | ------------------------------------ | ---------------------------------------------- |
| `core/`                          | only `core/`                         | `chrome.*`, `indexedDB`, `fetch`, DOM          |
| `lib/`                           | `core/`                              | other layers                                   |
| `data/`                          | `core/`, `lib/`, platform APIs       | DOM, `services/`, `common/`, surfaces          |
| `services/`                      | `core/`, `lib/`, `data/`             | DOM, `common/components/`                      |
| `common/components/`             | `core/`, `lib/`, services via `deps` | repositories, `chrome.*`, `indexedDB`, `fetch` |
| `viewer/`, `panel/`, `settings/` | everything                           | containing business logic                      |

## Download path (MV3 constraint)

The service worker never touches XLSX bytes. The viewer page loads the user's
cached template, patches only the target sheet's XML (fflate zip surgery), and
downloads via Blob + `chrome.downloads.download`. Extension pages have
`URL.createObjectURL`; workers do not. Never move export building back into the
background, and never regenerate the workbook with a spreadsheet library
(ExcelJS/SheetJS re-serialization corrupts formatted templates).

## Related docs

- [`timeline.md`](timeline.md) — the four timeline rules and the timezone contract.
- [`time-handling.md`](time-handling.md) — how timestamps flow from UTC to the instance clock, with worked examples and test instructions.
- [`sla-formula-analysis.md`](sla-formula-analysis.md) — how derived times feed the SLA formulas.
