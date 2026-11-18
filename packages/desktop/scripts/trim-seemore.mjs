#!/usr/bin/env node
/**
 * Removes files the staged CLI never reads at runtime, to keep the download small
 * (DESKTOP-SPEC §9). Run by `stage-seemore.mjs`; also runnable on its own:
 * `node scripts/trim-seemore.mjs <stage dir>`.
 *
 * Whole categories nothing loads: source maps, type definitions, and docs. Licence files
 * stay. Other package code, including builds seemore doesn't pick, is left alone: Vite
 * resolves dependencies at runtime through their `exports` maps, and a missing file there
 * fails a user's build rather than ours. The exceptions are the files in DROP_FILES, each
 * checked to be unreachable from `dev`, `build` and `export`; the e2e suite builds and exports
 * a site with a D2 diagram from the trimmed CLI.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DROP = [/\.map$/, /\.d\.[cm]?ts$/, /\.flow$/, /\.(md|markdown)$/i];
const KEEP = /^(licen[cs]e|notice|copying)/i;

// Relative to the stage's node_modules.
const DROP_FILES = [
  // D2's Node builds, 25 MB each. The browser renders diagrams with dist/browser, which embeds
  // its own wasm. Node only resolves the package (`require.resolve` in seemore's Vite config)
  // and bundles the entry into the prerender build, where the import sits in an effect that
  // never runs. Each index.js stays, so both still resolve.
  '@terrastruct/d2/dist/node-cjs/d2.wasm',
  '@terrastruct/d2/dist/node-cjs/elk.js',
  '@terrastruct/d2/dist/node-esm/d2.wasm',
  '@terrastruct/d2/dist/node-esm/elk.js',
];

export function trim(dir) {
  let files = 0;
  let bytes = 0;
  const drop = (full) => {
    bytes += statSync(full).size;
    rmSync(full);
    files += 1;
  };
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && !KEEP.test(entry.name) && DROP.some((re) => re.test(entry.name))) {
        drop(full);
      }
    }
  };
  walk(dir);
  for (const path of DROP_FILES) {
    const full = join(dir, 'node_modules', path);
    if (existsSync(full)) drop(full);
  }
  return { files, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: trim-seemore.mjs <dir>');
    process.exit(1);
  }
  const { files, bytes } = trim(dir);
  console.log(`seemore-desktop: trimmed ${files} files, ${(bytes / 1048576).toFixed(1)} MB.`);
}
