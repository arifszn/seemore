/**
 * Where the bundled seemore CLI lives (DESKTOP-SPEC §9):
 * - macOS and Linux, packaged: `resources/seemore/`.
 * - Windows, packaged: unpacked on first launch from `resources/seemore-cli.tar.br` into
 *   `%LOCALAPPDATA%\seemore\cli\<key>\` (`cliArchive.ts`).
 * - From source: the staging directory from `pnpm stage`. `SEEMORE_CLI_ARCHIVE` (a directory
 *   holding an archive from `scripts/pack-cli.mjs`) takes the Windows path instead; the
 *   end-to-end tests use it.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
// Inlined at build time. `scripts/stage-seemore.mjs` packs the same workspace package, so a
// build expects exactly the CLI it ships.
import { version } from '../../../seemore/package.json';
import { type CliArchive, unpackCli, unpackedDir } from './cliArchive.js';

/** The seemore version this build was made with; the bundled CLI must match it (§6). */
export const EXPECTED_CLI_VERSION: string = version;

/** The directory `seemore` was installed into: it holds `node_modules/seemore`. */
let installDir: string | undefined;

function cliArchive(): CliArchive | undefined {
  const override = process.env.SEEMORE_CLI_ARCHIVE;
  if (override !== undefined) return { dir: override, cacheRoot: join(app.getPath('userData'), 'cli') };
  if (!app.isPackaged || process.platform !== 'win32') return undefined;
  // Local, not roaming: 240 MB that every machine can unpack for itself.
  const local = process.env.LOCALAPPDATA;
  return {
    dir: process.resourcesPath,
    cacheRoot: local === undefined ? join(app.getPath('userData'), 'cli') : join(local, 'seemore', 'cli'),
  };
}

/** True when `prepareCli` has an archive to unpack first, so the caller can show progress. */
export function cliNeedsUnpack(): boolean {
  const archive = cliArchive();
  return archive !== undefined && !existsSync(unpackedDir(archive));
}

/** Resolves once the CLI is on disk. Call before the first `cliEntry()`. */
export async function prepareCli(onProgress?: (fraction: number) => void): Promise<void> {
  const archive = cliArchive();
  if (archive !== undefined) installDir = await unpackCli(archive, onProgress);
  else if (app.isPackaged) installDir = join(process.resourcesPath, 'seemore');
  else installDir = join(app.getAppPath(), 'build', 'stage', 'seemore');
}

function seemoreDir(): string {
  if (installDir === undefined) throw new Error('The seemore CLI is not ready yet.');
  return join(installDir, 'node_modules', 'seemore');
}

export function cliEntry(): string {
  return join(seemoreDir(), 'dist', 'cli', 'index.js');
}

export function cliPackageJson(): string {
  return join(seemoreDir(), 'package.json');
}
