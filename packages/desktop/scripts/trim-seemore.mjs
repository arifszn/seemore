#!/usr/bin/env node
/**
 * Removes files the staged CLI never reads at runtime, to keep the download small
 * (DESKTOP-SPEC §9). Run by `stage-seemore.mjs`; also runnable on its own:
 * `node scripts/trim-seemore.mjs <stage dir>`.
 *
 * Only whole categories nothing loads: source maps, type definitions, and docs. Licence
 * files stay. Package code, including builds seemore doesn't pick, is left alone: Vite
 * resolves dependencies at runtime through their `exports` maps, and a missing file there
 * fails a user's build rather than ours.
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DROP = [/\.map$/, /\.d\.[cm]?ts$/, /\.flow$/, /\.(md|markdown)$/i];
const KEEP = /^(licen[cs]e|notice|copying)/i;

export function trim(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && !KEEP.test(entry.name) && DROP.some((re) => re.test(entry.name))) {
        bytes += statSync(full).size;
        rmSync(full);
        files += 1;
      }
    }
  };
  walk(dir);
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
