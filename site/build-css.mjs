#!/usr/bin/env node
/*
 * build-css.mjs — compile the site's Tailwind CSS.
 *
 * Run from the repo root:  node site/build-css.mjs
 *
 * Invokes the Tailwind v4 CLI (@tailwindcss/cli) on site/styles-src/app-src.css
 * — a physical copy of the extension's theme + components — and writes a
 * minified bundle to site/assets/css/app.css. The input file's @source globs
 * point at both the site mockups and the real extension UI source, so every
 * utility + component class the real panel/viewer/settings use is emitted.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const tailwindBin = resolve(repoRoot, "node_modules/.bin/tailwindcss");
const input = resolve(__dirname, "styles-src/app-src.css");
const output = resolve(__dirname, "assets/css/app.css");

for (const [label, p] of [
  ["Tailwind CLI", tailwindBin],
  ["input CSS", input]
]) {
  if (!existsSync(p)) {
    console.error(`build-css: ${label} not found at ${p}`);
    process.exit(1);
  }
}

console.log("build-css: compiling", input);
console.log("build-css:   ->", output);

const result = spawnSync(tailwindBin, ["-i", input, "-o", output, "--minify"], {
  cwd: repoRoot,
  stdio: "inherit"
});

if (result.error) {
  console.error("build-css: failed to run Tailwind CLI:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`build-css: Tailwind CLI exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!existsSync(output)) {
  console.error("build-css: expected output was not produced:", output);
  process.exit(1);
}

const { size } = statSync(output);
console.log(`build-css: wrote ${output} (${size} bytes)`);
