#!/usr/bin/env node
/**
 * `vsce package`, but for a pnpm workspace.
 *
 * In development `node_modules/seemore` is a pnpm workspace symlink, so a CLI change is
 * visible without a publish. `vsce package` cannot ship that: the VSIX needs a real,
 * self-contained dependency tree, because the CLI it spawns runs as a separate node process
 * and needs `vite`, `react`, `shiki` and the rest resolvable from disk on the machine it's
 * installed on — not a symlink into this checkout's pnpm store, which won't exist there.
 *
 * `vsce` also insists the whole directory it packages be an ordinary, `npm list`-consistent
 * tree — which packages/vscode's own pnpm-managed node_modules (holding tsup, vitest, and
 * the rest of its own devDependencies as pnpm symlinks) is not. So this builds a throwaway
 * staging directory instead of packaging in place: just the compiled extension, a
 * `package.json` with `seemore` pinned to the exact version being released, and a plain
 * `npm install` of a real `seemore` tarball (`pnpm pack`, which respects its `files` field
 * and runs its own `prepack`) — nothing pnpm has ever touched.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const vscodeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(vscodeDir, '..', '..');
const seemoreDir = join(repoRoot, 'packages', 'seemore');

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

const seemorePkg = JSON.parse(readFileSync(join(seemoreDir, 'package.json'), 'utf8'));
const vscodePkg = JSON.parse(readFileSync(join(vscodeDir, 'package.json'), 'utf8'));

console.log(`seemore-vscode: building seemore@${seemorePkg.version} and the extension...`);
run('pnpm', ['--filter', 'seemore', 'run', 'build'], repoRoot);
run('pnpm', ['--filter', 'seemore-vscode', 'run', 'build'], repoRoot);

// Two separate scratch directories: `packDir` is scanned by nothing and never zipped;
// `stagingDir` is exactly the tree vsce packages, so nothing meant to stay out of the VSIX
// (the tarball included) can end up inside it.
const packDir = mkdtempSync(join(tmpdir(), 'seemore-vsix-pack-'));
const stagingDir = mkdtempSync(join(tmpdir(), 'seemore-vsix-staging-'));

try {
  console.log('seemore-vscode: packing seemore into a real tarball...');
  run('pnpm', ['--filter', 'seemore', 'pack', '--pack-destination', packDir], repoRoot);
  const tarball = join(packDir, `seemore-${seemorePkg.version}.tgz`);

  console.log('seemore-vscode: assembling a clean staging directory...');
  cpSync(join(vscodeDir, 'dist'), join(stagingDir, 'dist'), { recursive: true });
  cpSync(join(vscodeDir, '.vscodeignore'), join(stagingDir, '.vscodeignore'));
  cpSync(join(vscodeDir, 'README.md'), join(stagingDir, 'README.md'));
  cpSync(join(vscodeDir, 'assets'), join(stagingDir, 'assets'), { recursive: true });
  cpSync(join(repoRoot, 'LICENSE'), join(stagingDir, 'LICENSE'));
  writeFileSync(
    join(stagingDir, 'package.json'),
    JSON.stringify({ ...vscodePkg, dependencies: { seemore: seemorePkg.version } }, null, 2),
  );

  console.log('seemore-vscode: installing seemore and its real dependency tree...');
  run('npm', ['install', tarball, '--no-save', '--loglevel=error'], stagingDir);

  console.log('seemore-vscode: packaging...');
  // `pnpm exec` resolves relative to the workspace; the staging dir isn't part of it, so
  // vsce is invoked by its real path in this package's own node_modules/.bin instead.
  const vsceBin = join(vscodeDir, 'node_modules', '.bin', 'vsce');
  run(vsceBin, ['package', '--out', vscodeDir, ...process.argv.slice(2)], stagingDir);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
