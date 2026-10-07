import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE as PACKED_ARCHIVE, MANIFEST as PACKED_MANIFEST, packCli } from '../scripts/pack-cli.mjs';
import { ARCHIVE, archiveKey, type CliArchive, MANIFEST, unpackCli, unpackedDir } from '../src/main/cliArchive.js';

let work: string;
let stage: string;
let archive: CliArchive;

/** Deeper than Windows' MAX_PATH on its own, like fumadocs-ui's bundled copy of image-zoom. */
const DEEP = join('node_modules', 'pkg', ...Array.from({ length: 12 }, (_, i) => `segment-${i}-${'x'.repeat(16)}`), 'deep.js');

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), 'seemore-cli-archive-'));
  stage = join(work, 'stage');
  mkdirSync(join(stage, 'node_modules', 'seemore'), { recursive: true });
  writeFileSync(join(stage, 'node_modules', 'seemore', 'package.json'), '{"version":"1.0.0"}');
  mkdirSync(join(stage, DEEP, '..'), { recursive: true });
  writeFileSync(join(stage, DEEP), 'export default 1;\n');
  archive = { dir: join(work, 'archive'), cacheRoot: join(work, 'cache') };
  await packCli(stage, archive.dir, { quality: 1 });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('CLI archive', () => {
  it('names the same files the packer writes', () => {
    expect([ARCHIVE, MANIFEST]).toEqual([PACKED_ARCHIVE, PACKED_MANIFEST]);
  });

  it('unpacks every file, deep paths included, into a directory named by the hash', async () => {
    expect(DEEP.length).toBeGreaterThan(260);
    const progress: number[] = [];
    const dir = await unpackCli(archive, (fraction) => progress.push(fraction));
    expect(dir).toBe(join(archive.cacheRoot, archiveKey(archive)));
    expect(readFileSync(join(dir, 'node_modules', 'seemore', 'package.json'), 'utf8')).toBe('{"version":"1.0.0"}');
    expect(readFileSync(join(dir, DEEP), 'utf8')).toBe('export default 1;\n');
    expect(progress.at(-1)).toBe(1);
  });

  it('reuses a finished copy, and removes other builds and interrupted runs', async () => {
    mkdirSync(join(archive.cacheRoot, '0123456789abcdef'), { recursive: true });
    mkdirSync(join(archive.cacheRoot, `${archiveKey(archive)}.partial-1`), { recursive: true });
    const dir = await unpackCli(archive);
    writeFileSync(join(dir, 'marker'), '');
    expect(await unpackCli(archive)).toBe(dir);
    expect(existsSync(join(dir, 'marker'))).toBe(true);
    expect(readdirSync(archive.cacheRoot)).toEqual([archiveKey(archive)]);
  });

  it('gives a rebuilt archive its own directory', async () => {
    const first = await unpackCli(archive);
    writeFileSync(join(stage, 'node_modules', 'seemore', 'package.json'), '{"version":"1.0.1"}');
    await packCli(stage, archive.dir, { quality: 1 });
    const second = await unpackCli(archive);
    expect(second).not.toBe(first);
    expect(readdirSync(archive.cacheRoot)).toEqual([archiveKey(archive)]);
  });

  it('leaves nothing behind when the archive is damaged', async () => {
    const file = join(archive.dir, ARCHIVE);
    writeFileSync(file, readFileSync(file).subarray(0, 200));
    await expect(unpackCli(archive)).rejects.toThrow();
    expect(existsSync(unpackedDir(archive))).toBe(false);
    expect(readdirSync(archive.cacheRoot)).toEqual([]);
  });
});
