# DI Container

The container in `di/` wires the layers together. It is deliberately small: no
decorators, no reflection, and no service locator (with one documented
exception).

## Tokens

- `di/token.ts` provides branded string tokens.
- `di/tokens.ts` is the registry. **Every import there is `import type`**, so
  the registry emits no runtime references and the dependency graph stays
  acyclic.

## Declaring dependencies

Classes take their dependencies as **constructor arguments** and declare them as
a `static deps` array of tokens:

```ts
export class PullService {
  static readonly deps = [RUN_SCOPE_FACTORY, SETTINGS_REPO, DATASET_REPO, RUN_STATE_REPO] as const;
  constructor(scopeFactory, settings, dataset, runState) {
    /* ... */
  }
}
```

esbuild cannot emit decorator metadata, so reflection-based DI is unavailable —
the `static deps` array is how the container knows what to inject.

## No decorators, no service locator

There are no decorators and no service locator, **except `RUN_SCOPE_FACTORY`**,
which exists because `SN_REMOTE` is bound to one instance URL per pull. A pull
resolves its scope (transport + remote for a given instance) through that
factory rather than pulling a globally-bound client.

## Per-container singletons and `child()`

Singletons are cached **per container**, not globally. `register(t, factory, {
singleton: true })` memoises the instance on whichever container **owns** the
token, but resolution always starts from the container `resolve()` was called
on (`#resolveFrom` walks up to the owner and invokes its provider with that
starting `root`). A `child()` container can therefore override a dependency and
everything above it resolves the child's version. That is what lets tests inject
fakes: a child overrides, say, `SN_REMOTE` or a repository with an in-memory
twin, and the services resolve the fake. See `di/container.ts` and the tests in
`tools/di-test.ts`, `tools/repository-test.ts`.

The container surface is deliberately small: `registerValue` (a ready-made
value, always a singleton), `register` (a factory, optionally singleton),
`registerClass` (auto-wires a class from its `static deps`), `resolve`, `has`,
and `child`.

## Registration

Per-surface registration functions bind the graph:

- `di/register-core.ts` — the shared `chrome.storage`-backed repositories every
  surface needs (settings, dataset, run-state, export-config, viewer-prefs,
  template, filter-list, filter-preset, msr-lists, and the Weekly Summary filter
  override `CHANGE_SUMMARY_REPO` → `ChangeSummaryStore`), plus the default
  key/value store and notifier. All are registered as per-container singletons.
- `di/register-background.ts` — the service-worker-only bindings: `IDB`, the
  IndexedDB-backed `TICKET_REPO`/`TIMELINE_REPO`, and `RUN_SCOPE_FACTORY`. The
  factory opens a per-run `child()`, binds `SN_REMOTE` for the requested
  instance URL, and returns the ticket + timeline repositories wired to it.

A surface builds its container from these (`createRootContainer()` /
`createBackgroundContainer()`), then constructs its composition root.

---

Related: [Architecture](Architecture) · [Testing](Testing) ·
[Authentication Chain](Authentication-Chain)
