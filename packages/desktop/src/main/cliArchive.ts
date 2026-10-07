/**
 * Unpacks the Windows build's CLI archive (`scripts/pack-cli.mjs`, DESKTOP-SPEC §9) into
 * `<cacheRoot>/<key>/`, keyed by the archive's sha256, so each build unpacks once and a
 * rebuilt CLI never reuses a stale copy. Electron-free.
 *
 * It unpacks into a temporary sibling and renames that into place, so `<key>/` exists only
 * when complete. Node's fs reaches paths past MAX_PATH, which NSIS can't.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress } from 'node:zlib';
import { extract } from 'tar';

// Also in scripts/pack-cli.mjs, which writes them; the round-trip tests catch a mismatch.
export const ARCHIVE = 'seemore-cli.tar.br';
export const MANIFEST = 'seemore-cli.json';

export interface CliArchive {
  /** The directory holding `seemore-cli.tar.br` and `seemore-cli.json`. */
  dir: string;
  /** Where unpacked copies live, one directory per key. */
  cacheRoot: string;
}

/** The first 16 hex digits of the archive's sha256, from its manifest. */
export function archiveKey(archive: CliArchive): string {
  const { sha256 } = JSON.parse(readFileSync(join(archive.dir, MANIFEST), 'utf8')) as { sha256?: unknown };
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${MANIFEST} has no valid sha256.`);
  return sha256.slice(0, 16);
}

/** The unpacked copy for this archive; it exists only once unpacking has finished. */
export function unpackedDir(archive: CliArchive): string {
  return join(archive.cacheRoot, archiveKey(archive));
}

/**
 * Unpacks the archive unless it already is, then deletes copies of other builds and leftovers
 * of interrupted runs. Resolves to the unpacked directory. `onProgress` gets a fraction of
 * the archive read so far.
 */
export async function unpackCli(archive: CliArchive, onProgress?: (fraction: number) => void): Promise<string> {
  const key = archiveKey(archive);
  const dest = join(archive.cacheRoot, key);
  if (!existsSync(dest)) {
    const temp = join(archive.cacheRoot, `${key}.partial-${process.pid}`);
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp, { recursive: true });
    const file = join(archive.dir, ARCHIVE);
    const total = statSync(file).size;
    let read = 0;
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        read += chunk.length;
        onProgress?.(read / total);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(createReadStream(file), progress, createBrotliDecompress(), extract({ cwd: temp, strict: true }));
      renameSync(temp, dest);
    } catch (error) {
      rmSync(temp, { recursive: true, force: true });
      throw error;
    }
  }
  removeOthers(archive.cacheRoot, key);
  return dest;
}

function removeOthers(cacheRoot: string, key: string): void {
  for (const name of readdirSync(cacheRoot)) {
    if (name === key) continue;
    try {
      rmSync(join(cacheRoot, name), { recursive: true, force: true });
    } catch {
      // In use or locked; the next launch tries again.
    }
  }
}
