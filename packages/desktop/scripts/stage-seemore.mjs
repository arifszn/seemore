#!/usr/bin/env node
/**
 * Stages the seemore CLI the app ships, at `build/stage/seemore/node_modules/seemore/`.
 * electron-builder's `extraResources` copies `build/stage/` to `resources/` (DESKTOP-SPEC §9).
 *
 * The app ships the dependency versions the workspace's tests ran against: those in
 * `pnpm-lock.yaml`. Not a fresh `npm install`, which resolves whatever is newest on npm that
 * day; mdast-util-to-markdown 2.2.0 broke search and build that way four days after its
 * release, in an app built from a tested commit.
 *
 * - seemore's own files: `pnpm pack` (which respects its `files` field and runs its
 *   `prepack`), extracted as `node_modules/seemore`.
 * - Its dependencies: `pnpm deploy --prod`, which installs from the workspace lockfile
 *   without resolving anything again. `node-linker=hoisted` gives a flat tree with no
 *   symlinks, the layout `npm install` produced. Deploy's own copy of seemore is not used:
 *   it leaves out `dist/`, which is gitignored.
 *
 * Then `trim-seemore.mjs` removes source maps, type definitions and docs (§9).
 *
 * The extra `stage/` level is required: electron-builder always drops a `node_modules` at the
 * root of an `extraResources` source, and keeps a nested one only when a filter names it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from 'tar';
import { trim } from './trim-seemore.mjs';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..', '..');
const seemoreDir = join(repoRoot, 'packages', 'seemore');
const stageDir = join(desktopDir, 'build', 'stage', 'seemore');
const modulesDir = join(stageDir, 'node_modules');

function run(command, args, cwd) {
  // pnpm is a .cmd shim on Windows, which execFileSync can't launch directly.
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

/** Removes every `.bin` directory: symlinks and shims to executables the CLI never runs. */
function dropBins(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === '.bin') rmSync(full, { recursive: true, force: true });
    else dropBins(full);
  }
}

const { version } = JSON.parse(readFileSync(join(seemoreDir, 'package.json'), 'utf8'));

console.log(`seemore-desktop: building seemore@${version}...`);
run('pnpm', ['--filter', 'seemore', 'run', 'build'], repoRoot);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(modulesDir, { recursive: true });
writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify({ name: 'seemore-desktop-stage', private: true }, null, 2)}\n`);

// On the same volume as the stage, so its packages move in by rename.
const workDir = mkdtempSync(join(desktopDir, 'build', '.stage-'));
try {
  console.log('seemore-desktop: packing seemore into a tarball...');
  run('pnpm', ['--filter', 'seemore', 'pack', '--pack-destination', workDir], repoRoot);
  const own = join(modulesDir, 'seemore');
  mkdirSync(own);
  await extract({ file: join(workDir, `seemore-${version}.tgz`), cwd: own, strip: 1 });

  console.log('seemore-desktop: deploying its dependencies from pnpm-lock.yaml...');
  const deployDir = join(workDir, 'deploy');
  run(
    'pnpm',
    [
      '--filter',
      'seemore',
      'deploy',
      '--prod',
      '--frozen-lockfile',
      '--config.inject-workspace-packages=true',
      '--config.node-linker=hoisted',
      deployDir,
    ],
    repoRoot,
  );
  const deployed = join(deployDir, 'node_modules');
  for (const name of readdirSync(deployed)) {
    // pnpm's own bookkeeping (.pnpm, .modules.yaml) and .bin stay behind. So does esbuild
    // (20 MB): only Vite refers to it, as an optional peer the workspace happens to satisfy;
    // `npm install seemore` never installs it, and seemore runs without it.
    if (name.startsWith('.') || name === 'esbuild' || name === '@esbuild') continue;
    renameSync(join(deployed, name), join(modulesDir, name));
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
dropBins(modulesDir);

const { files, bytes } = trim(stageDir);
console.log(`seemore-desktop: trimmed ${files} files, ${(bytes / 1048576).toFixed(1)} MB.`);

console.log(`seemore-desktop: staged seemore@${version}.`);
