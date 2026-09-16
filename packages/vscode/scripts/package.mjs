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

// The docs site plays the same demo video the README does (packages/site/assets/seemore.mp4).
const SITE_URL = 'https://arifszn.github.io/seemore/';
const README_VIDEO_UPLOAD = /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+/g;

function run(command, args, cwd) {
  // npm/pnpm/vsce all resolve to .cmd/.ps1 shims on Windows, which execFileSync can't launch
  // directly — route through the shell there, same as npm scripts do, so PATHEXT resolves them.
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
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
  // GitHub only renders a README <video> whose src is a user-attachments upload, but that URL
  // 404s for anyone not signed in to GitHub, so the Marketplace page shows an empty player.
  // The VSIX copy points at the same video on the docs site, which loads for everyone.
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const uploads = new Set(readme.match(README_VIDEO_UPLOAD));
  if (uploads.size !== 1) {
    throw new Error(`README.md should have one user-attachments video, found ${uploads.size}`);
  }
  // Read the URL off the live page rather than pinning it: the site build names the file with
  // a content hash, so it changes whenever the video does.
  const site = await fetch(SITE_URL);
  if (!site.ok) throw new Error(`${SITE_URL} returned ${site.status}`);
  const siteVideos = new Set((await site.text()).match(/[^"'\s]+\.mp4\b/g));
  if (siteVideos.size !== 1) {
    throw new Error(`${SITE_URL} should play one .mp4, found ${siteVideos.size}`);
  }
  const siteVideo = new URL([...siteVideos][0], SITE_URL).href;
  writeFileSync(
    join(stagingDir, 'README.md'),
    readme.replaceAll(README_VIDEO_UPLOAD, siteVideo),
  );
  // Shared with the site's default favicon, so it lives at the repo root next to README
  // and LICENSE — but it still has to land at `assets/` here, where `package.json`'s
  // "icon" field points.
  cpSync(join(repoRoot, 'assets'), join(stagingDir, 'assets'), { recursive: true });
  cpSync(join(repoRoot, 'LICENSE'), join(stagingDir, 'LICENSE'));
  // `devDependencies` is dropped rather than carried over with the spread. npm resolves a
  // tree for the whole staged manifest, and doing that here — in a directory whose only
  // real input is the local tarball installed below — makes npm 10.9 crash outright with
  // "Cannot read properties of null (reading 'edgesOut')". Reproduced with the staged
  // `seemore` version both published and unpublished, so it is the devDependencies
  // themselves, not the version, that npm chokes on. They were never wanted here anyway:
  // vsce ships production dependencies only, so installing tsup, vitest and vsce into the
  // staging directory was pure cost that never reached the VSIX.
  const { devDependencies: _ignored, ...manifest } = vscodePkg;
  writeFileSync(
    join(stagingDir, 'package.json'),
    JSON.stringify({ ...manifest, dependencies: { seemore: seemorePkg.version } }, null, 2),
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
