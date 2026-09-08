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
  constructor(scopeFactory, settings, dataset, runState) { /* ... */ }
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

Singletons are cached **per container**, so a `child()` container can override a
dependency. That is what lets tests inject fakes: a child overrides, say, the
`SN_REMOTE` or a repository with an in-memory twin, and everything above it
resolves the fake. See `di/container.ts` and the tests in `tools/di-test.ts`,
`tools/repository-test.ts`.

## Registration

Per-surface registration functions bind the graph:

- `di/register-core.ts` — the shared core/data/services bindings.
- `di/register-background.ts` — the service-worker bindings.

A surface builds its container from these, then constructs its composition root.

---
Related: [Architecture](Architecture) · [Testing](Testing) ·
[Authentication Chain](Authentication-Chain)
