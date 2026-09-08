# Building and Running

There is a build (esbuild) but **no bundler or package manager for tests** —
verify with node. Sources are TypeScript and Chrome cannot load them directly,
so you always run a **built** folder.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build to `dev/` and rebuild on change. Load `dev/` unpacked. |
| `npm run watch` | Alias for the watch build to `dev/`. |
| `npm run build` | Production build to `dist/` (bundled, mirrors repo layout). |
| `npm run zip` | Package `dist/` for distribution. |
| `npm run css` / `css:watch` | Build the Tailwind CSS to `styles/output.css`. |
| `npm run typecheck` | `tsc` against `tsconfig.json` + `tsconfig.strict.json`. |
| `npm run lint` | ESLint. |
| `npm test` | Offline test suites — see [Testing](Testing). |
| `npm run release` | typecheck + lint + test + build. |

## Loading the extension

Loading the repository **root** unpacked no longer works: `.ts` files are served
with a non-JavaScript MIME type and the type annotations are not valid JS. Load
a built folder:

- `npm run dev` → load `dev/` (the development loop).
- `npm run build` → load `dist/` (smoke-test the release shape).

`dev/` and `dist/` are both gitignored. Watch mode targets `dev/` and never
writes into the repo root — the esbuild entries **are** the sources, so bundling
to root would overwrite `panel/panel.js` and friends with their own output.
`build.mjs` refuses to build into root.

## Quick verify after a change

```bash
node --check platform/background.ts core/*.ts lib/*.ts surfaces/viewer/*.ts panel/*.ts settings/*.ts content/content.js && \
node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
```

Pure `core/` modules are ES modules and run standalone in plain node.

## Manual test loop

Reload the extension at `chrome://extensions` → **refresh the ServiceNow tab** →
Connect → Preview count → Run export. The tab refresh is required so the content
script exists (see [Authentication Chain](Authentication-Chain)).

---
Related: [Installation](Installation) · [Testing](Testing) ·
[Release Process](Release-Process)
