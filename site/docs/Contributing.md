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
npm run format:check && npm run typecheck && npm run lint && npm test && npm run build
```

Code style is enforced by **Prettier** — run `npm run format` to write and
`npm run format:check` to verify (config `.prettierrc.json`, exclusions
`.prettierignore`). `eslint-config-prettier` is the last entry in
`eslint.config.mjs`, so ESLint never fights the formatter.

Every component needs its own test — see [Testing](Testing).

## Editing the docs

The documentation lives in this repository under `wiki/` and is published as a
static website via **GitHub Pages** — see the `Deploy Pages` workflow
(`.github/workflows/deploy-pages.yaml`), which is the canonical documentation
home. Edit the files under `wiki/`; the deploy workflow copies them into the
site (`site/docs/`) with `site/sync-docs.mjs` and renders them in-browser with
diagrams. New pages must be added to `wiki/_Sidebar.md` and linked from
`wiki/Home.md`.

The site also recreates the extension's three UI surfaces (side panel, data
viewer, settings) with annotated callouts; that part lives under `site/`. See
[`site/README.md`](../site/README.md) for how to preview and build the site
locally.

> The old GitHub **Wiki tab** and its `Sync Wiki` workflow have been retired in
> favor of the Pages site. Don't edit the Wiki tab.

---

Related: [Architecture](Architecture) · [Testing](Testing) ·
[Release Process](Release-Process)
