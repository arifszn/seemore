#!/usr/bin/env node
/**
 * Packs the staged CLI into one archive for Windows (DESKTOP-SPEC §9): `seemore-cli.tar.br`
 * and `seemore-cli.json` ({sha256}) in `outDir`. The app unpacks it on first launch, so the
 * installer writes one file instead of 12,000, and NSIS, which can't reach paths past
 * MAX_PATH, never sees the CLI's deep ones. Run by `before-pack.cjs` for Windows builds; also
 * runnable on its own: `node scripts/pack-cli.mjs <stage dir> <out dir>`.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { create } from 'tar';

export const ARCHIVE = 'seemore-cli.tar.br';
export const MANIFEST = 'seemore-cli.json';

/** `quality` 9 is about 50 MB in 20 s; tests pass a lower one. */
export async function packCli(stageDir, outDir, { quality = 9 } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const archive = join(outDir, ARCHIVE);
  await pipeline(
    create({ cwd: stageDir, portable: true, noMtime: true }, ['.']),
    zlib.createBrotliCompress({
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 },
    }),
    createWriteStream(archive),
  );
  const hash = createHash('sha256');
  await pipeline(createReadStream(archive), hash);
  const sha256 = hash.digest('hex');
  writeFileSync(join(outDir, MANIFEST), `${JSON.stringify({ sha256 }, null, 2)}\n`);
  return { archive, sha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stageDir, outDir] = process.argv.slice(2);
  if (!stageDir || !outDir) {
    console.error('usage: pack-cli.mjs <stage dir> <out dir>');
    process.exit(1);
  }
  const { archive, sha256 } = await packCli(resolve(stageDir), resolve(outDir));
  console.log(`seemore-desktop: packed ${archive} (${sha256.slice(0, 16)})`);
}
