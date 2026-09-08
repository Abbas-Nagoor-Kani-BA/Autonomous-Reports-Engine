# Contributing

Conventions and constraints for changing the code. These keep the build,
type-stripping, and MV3 runtime working.

## Language and modules

- **ES2022 max** (MV3 service workers): private `#methods`; avoid top-level
  `await`.
- **ES modules everywhere**: `package.json` has `"type":"module"`; the service
  worker is `"type":"module"`; pages load a single `<script type="module">`
  entry. No IIFE/`globalThis` attaches, no `importScripts`, no `require()`.
- `.ts` files are **type-checked, not compiled** — esbuild strips the types.
  Import specifiers use **explicit `.ts`** because Node does not rewrite
  `.js` → `.ts`.
- **Avoid `enum`, `namespace`, and parameter properties.** Node's type stripping
  cannot transform them; ESLint bans them.

## Type configs

Two tsconfigs: the base checks everything non-strictly;
`tsconfig.strict.json` checks an explicit, growing list of migrated files
strictly and sets `checkJs: false` so strictness cannot leak into un-migrated
JS. Keep both at **0 errors**.

## Architecture and contracts

- Respect the layering rules in [Architecture](Architecture) — dependency
  direction is strictly downward.
- Follow the [DI Container](DI-Container) pattern: constructor args +
  `static deps`, no decorators, no service locator (except
  `RUN_SCOPE_FACTORY`).
- Follow the [Component Contract](Component-Contract): build-once / patch-always,
  no instance fields or `#private` methods during `build()`, siblings via
  `deps`.
- Do not change the semantics of the [Timeline and SLA Rules](Timeline-and-SLA-Rules)
  or the [Timezone Contract](Timezone-Contract) without asking — they are
  business requirements.

## Style

- **No code comments unless asked; no emojis** in output files.
- Mutable shared state is owned by exactly one module and exposed via accessor
  functions, never via reassigned imports.
- All user-facing strings in English; timestamps ISO 8601.
- **Never log or store full token values** — prefix only (first 8 chars) in
  diagnostics.
- The instance URL comes from user input/storage; always validate `https://`.

## Before you push

Run the full gate and add a test for anything new:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Every component needs its own test — see [Testing](Testing).

## Editing the wiki

The wiki pages live in this repository under `wiki/` and are published to the
GitHub Wiki automatically on push to `main` (see the `Sync Wiki` workflow). Edit
the files under `wiki/`, **not** the Wiki tab — direct Wiki edits are overwritten
on the next sync. New pages must be added to `wiki/_Sidebar.md` and linked from
`wiki/Home.md`.

---
Related: [Architecture](Architecture) · [Testing](Testing) ·
[Release Process](Release-Process)
