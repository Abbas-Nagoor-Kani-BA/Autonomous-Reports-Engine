# Autonomous Reports Engine — documentation site

A static website (plain HTML/CSS/JS, no framework) that:

1. **Recreates the three extension surfaces** — the Side Panel, the Data Viewer,
   and the Settings page — using the extension's real markup and real Tailwind
   CSS, populated with sample data and annotated with numbered callouts that
   explain every control.
2. **Hosts the full wiki** — all pages under the repository's `wiki/` folder are
   rendered client-side (with mermaid diagrams) so `wiki/*.md` stays the single
   source of truth.

It is designed to be published with **GitHub Pages** and is the canonical
documentation home for the project.

## Structure

```
site/
  index.html            Landing / overview
  docs.html             Client-side wiki renderer (?p=PageName)
  surfaces/
    panel.html          Side Panel mockup + annotations
    viewer.html         Data Viewer mockup + annotations
    settings.html       Settings mockup + annotations
  docs/                 Copied wiki markdown + images (source of truth: ../wiki)
  assets/
    css/
      site.css          Site chrome (header/nav/footer/hero/cards)
      app.css           BUILT from the extension Tailwind theme (do not edit)
    js/
      layout.js         Shared header/nav/footer
      annotations.js    Reusable numbered-callout / hotspot system
      docs.js           Markdown + mermaid renderer, sidebar, link rewriting
      vendor/           marked + mermaid (pinned)
  build-css.mjs         Rebuilds assets/css/app.css from ../styles/tailwind.css
  sync-docs.mjs         Copies ../wiki/*.md and ../wiki/images into docs/
```

## Local preview

The pages use `fetch()` for the docs, so open them through a local web server
(not `file://`):

```bash
cd site
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Building the CSS

`assets/css/app.css` is generated from the extension's own Tailwind theme so the
mockups match the real UI exactly. Regenerate it after changing the surfaces or
the extension theme:

```bash
# from the repository root
node site/build-css.mjs
```

## Updating the docs

The docs are copied from `../wiki`. Refresh them with:

```bash
node site/sync-docs.mjs
```

Edit documentation in `wiki/`, never in `site/docs/` — the copies are
regenerated.
