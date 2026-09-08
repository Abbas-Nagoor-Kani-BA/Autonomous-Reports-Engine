# Installation

The repository sources are TypeScript, which Chrome cannot load directly. You
**always load a built folder**, never the repository root. Chrome serves `.ts`
files with a non-JavaScript MIME type and the type annotations are not valid JS,
so loading the root unpacked will not work.

## Requirements

- **Node.js 22+**
- **Google Chrome** (or Chromium)
- Access to a **ServiceNow instance** you can log into in the browser

## Build and load (production shape)

```bash
npm install
npm run build        # outputs dist/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`dist/`** folder.

![The extension loaded unpacked](images/placeholder.png)

The extension appears with the name **Autonomous Reports Engine** and opens as a
**side panel**.

## Development loop

For day-to-day development, build to `dev/` and rebuild on change, then load the
`dev/` folder instead of `dist/`:

```bash
npm run dev          # builds dev/ and rebuilds on change
```

- `dev/` and `dist/` are both gitignored.
- Reload the extension at `chrome://extensions` after a rebuild.
- **Refresh your ServiceNow tab after reloading the extension** — the content
  script that relays requests must be present in the tab. See
  [Authentication Chain](Authentication-Chain) for why.

## Packaging

```bash
npm run zip          # packs dist/ into a distributable .zip
```

## Next steps

- [Quick Start](Quick-Start) — configure and run your first pull.
- [Configuration](Configuration) — the full Settings reference.

---
Related: [Building and Running](Building-and-Running) ·
[Quick Start](Quick-Start) · [Configuration](Configuration)
