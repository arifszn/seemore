#!/usr/bin/env node
/**
 * Stages the seemore CLI the app ships, at `build/stage/seemore/node_modules/seemore/`.
 * electron-builder's `extraResources` copies `build/stage/` to `resources/` (DESKTOP-SPEC §9).
 *
 * The same approach as the extension's `scripts/package.mjs`: build the workspace's seemore,
 * `pnpm pack` it (which respects its `files` field and runs its `prepack`), and `npm install`
 * the tarball into a directory pnpm has never touched. The CLI runs from disk with its real
 * dependency tree, native binaries included, so no workspace symlink may reach a release.
 *
 * Then `trim-seemore.mjs` removes source maps, type definitions and docs (§9).
 *
 * The extra `stage/` level is required: electron-builder always drops a `node_modules` at the
 * root of an `extraResources` source, and keeps a nested one only when a filter names it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trim } from './trim-seemore.mjs';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..', '..');
const seemoreDir = join(repoRoot, 'packages', 'seemore');
const stageDir = join(desktopDir, 'build', 'stage', 'seemore');

function run(command, args, cwd) {
  // npm and pnpm are .cmd shims on Windows, which execFileSync can't launch directly.
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

const { version } = JSON.parse(readFileSync(join(seemoreDir, 'package.json'), 'utf8'));

console.log(`seemore-desktop: building seemore@${version}...`);
run('pnpm', ['--filter', 'seemore', 'run', 'build'], repoRoot);

const packDir = mkdtempSync(join(tmpdir(), 'seemore-desktop-pack-'));
try {
  console.log('seemore-desktop: packing seemore into a tarball...');
  run('pnpm', ['--filter', 'seemore', 'pack', '--pack-destination', packDir], repoRoot);
  const tarball = join(packDir, `seemore-${version}.tgz`);

  console.log(`seemore-desktop: installing it into ${stageDir}...`);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify({ name: 'seemore-desktop-stage', private: true }, null, 2)}\n`);
  run('npm', ['install', tarball, '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], stageDir);
} finally {
  rmSync(packDir, { recursive: true, force: true });
}

const { files, bytes } = trim(stageDir);
console.log(`seemore-desktop: trimmed ${files} files, ${(bytes / 1048576).toFixed(1)} MB.`);

console.log(`seemore-desktop: staged seemore@${version}.`);
