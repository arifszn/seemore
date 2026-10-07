#!/usr/bin/env node
/**
 * Writes `latest-mac.json`, the macOS update feed (DESKTOP-SPEC §10.3, §14.3): `{ payload,
 * signature }`, where `payload` is a JSON string naming the version and each architecture's
 * zip with its sha256, and `signature` is Ed25519 over the exact bytes of `payload`, base64.
 *
 * Usage: DESKTOP_UPDATE_KEY=<PEM> node scripts/sign-feed.mjs <version> <arm64 zip> <x64 zip> <out>
 *
 * Before writing, the feed is checked against the public key compiled into the app
 * (`src/main/update/feedKey.ts`): a secret that doesn't match it fails the release here,
 * instead of shipping a feed no installed app would accept.
 */
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The PEM in `feedKey.ts`, read as text: the script runs before anything is compiled. */
export function appPublicKey() {
  const source = readFileSync(join(desktopDir, 'src', 'main', 'update', 'feedKey.ts'), 'utf8');
  const pem = /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/.exec(source)?.[0];
  if (pem === undefined) throw new Error('feedKey.ts holds no public key.');
  return `${pem}\n`;
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * The signed feed for `version`. `zips` maps arm64 and x64 to the release's zip files; their
 * URLs are the release's asset URLs, which the app requires (`feed.ts`).
 */
export function buildFeed(version, zips, privateKeyPem, publicKeyPem) {
  const asset = (file) => ({
    url: `https://github.com/arifszn/seemore/releases/download/desktop-v${version}/${basename(file)}`,
    sha256: sha256(file),
  });
  const payload = JSON.stringify({ version, arm64: asset(zips.arm64), x64: asset(zips.x64) });
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKeyPem).toString('base64');
  if (!verify(null, Buffer.from(payload, 'utf8'), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'))) {
    throw new Error('DESKTOP_UPDATE_KEY does not match the public key in feedKey.ts.');
  }
  return { payload, signature };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, arm64, x64, out] = process.argv.slice(2);
  const key = process.env.DESKTOP_UPDATE_KEY;
  if (!version || !arm64 || !x64 || !out) {
    console.error('usage: DESKTOP_UPDATE_KEY=<PEM> node scripts/sign-feed.mjs <version> <arm64 zip> <x64 zip> <out>');
    process.exit(2);
  }
  if (!key) {
    console.error('DESKTOP_UPDATE_KEY is not set.');
    process.exit(2);
  }
  const feed = buildFeed(version, { arm64, x64 }, key, appPublicKey());
  writeFileSync(out, `${JSON.stringify(feed)}\n`);
  console.log(`seemore-desktop: signed ${basename(out)} for ${version}`);
}
