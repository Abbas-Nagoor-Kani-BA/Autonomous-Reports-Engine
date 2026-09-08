# Installation

Most users should **download the packaged extension from Releases** — no build
step needed. Building from source is only for development (see the last section).

## Requirements

- **Google Chrome** (or Chromium)
- Access to a **ServiceNow instance** you can log into in the browser

## Install from a release (recommended)

1. Open the repository's **[Releases](https://github.com/Abbas-Nagoor-Kani-BA/Autonomous-Reports-Engine/releases)**
   page.
2. Under the latest release's **Assets**, download the extension zip
   (`autonomous-reports-engine-<version>.zip`).
3. **Unzip** it to a folder you will keep — Chrome loads the extension from this
   folder, so don't delete it after loading.
4. Open `chrome://extensions`.
5. Enable **Developer mode** (top-right toggle).
6. Click **Load unpacked** and select the **unzipped folder**.

![The extension loaded unpacked](images/placeholder.png)

The extension appears with the name **Autonomous Reports Engine** and opens as a
**side panel**.

> After loading (or reloading) the extension, **refresh your ServiceNow tab** —
> the content script that relays requests must be present in the tab. See
> [Authentication Chain](Authentication-Chain) for why.

## Updating

When a new release is published, download the new zip, unzip it (over the old
folder or into a new one), and click the **reload** icon on the extension's card
at `chrome://extensions`. Your settings and data are stored in the browser and
are preserved across updates.

## Next steps

- [Quick Start](Quick-Start) — configure and run your first pull.
- [Configuration](Configuration) — the full Settings reference.

## Building from source (developers only)

You do **not** need this to use the extension. The repository sources are
TypeScript, which Chrome cannot load directly, so you always load a **built**
folder — never the repository root. Full details are in
[Building and Running](Building-and-Running).

```bash
npm install
npm run build        # outputs dist/ — load this folder unpacked
```

For the development loop, `npm run dev` builds to `dev/` and rebuilds on change;
load `dev/` instead. Both `dev/` and `dist/` are gitignored.

---
Related: [Quick Start](Quick-Start) · [Configuration](Configuration) ·
[Building and Running](Building-and-Running)
