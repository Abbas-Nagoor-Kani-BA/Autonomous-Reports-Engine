#!/usr/bin/env node
// sync-docs.mjs — copy the wiki into the site's docs folder.
//
// Run from the repo root:  node site/sync-docs.mjs
//
// Behavior:
//   - Copies every *.md from ../wiki into site/docs/ (including _Sidebar.md
//     and _Footer.md).
//   - Mirrors wiki/images/* into site/docs/images/ — but EXCLUDES
//     wiki/images/README.md (an internal image-capture checklist).
//   - Idempotent: safe to re-run; existing files are overwritten.
//   - Prints the list of copied files and a total count.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = __dirname; // .../site
const WIKI_DIR = path.resolve(SITE_DIR, "..", "wiki");
const DOCS_DIR = path.join(SITE_DIR, "docs");
const WIKI_IMAGES_DIR = path.join(WIKI_DIR, "images");
const DOCS_IMAGES_DIR = path.join(DOCS_DIR, "images");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src, dest) {
  await fs.copyFile(src, dest);
}

async function main() {
  await ensureDir(DOCS_DIR);
  await ensureDir(DOCS_IMAGES_DIR);

  const copied = [];

  // 1) Markdown pages (top-level of wiki only).
  const wikiEntries = await fs.readdir(WIKI_DIR, { withFileTypes: true });
  const mdFiles = wikiEntries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name)
    .sort();

  for (const name of mdFiles) {
    const src = path.join(WIKI_DIR, name);
    const dest = path.join(DOCS_DIR, name);
    await copyFile(src, dest);
    copied.push(path.relative(SITE_DIR, dest));
  }

  // 2) Images — mirror everything except images/README.md.
  let imageEntries = [];
  try {
    imageEntries = await fs.readdir(WIKI_IMAGES_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  for (const e of imageEntries) {
    if (!e.isFile()) continue;
    if (e.name.toLowerCase() === "readme.md") continue; // internal checklist
    const src = path.join(WIKI_IMAGES_DIR, e.name);
    const dest = path.join(DOCS_IMAGES_DIR, e.name);
    await copyFile(src, dest);
    copied.push(path.relative(SITE_DIR, dest));
  }

  console.log("Copied files:");
  for (const f of copied) console.log("  " + f);
  console.log(`\nTotal files copied: ${copied.length}`);
  console.log(`  Markdown pages: ${mdFiles.length}`);
  console.log(`  Images: ${copied.length - mdFiles.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
