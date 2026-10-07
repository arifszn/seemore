import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appPublicKey, buildFeed } from '../scripts/sign-feed.mjs';
import { verifyFeed } from '../src/main/update/feed.js';
import { FEED_PUBLIC_KEY } from '../src/main/update/feedKey.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function zips(version: string) {
  const dir = mkdtempSync(join(tmpdir(), 'seemore-sign-feed-'));
  dirs.push(dir);
  const arm64 = join(dir, `seemore-${version}-mac-arm64.zip`);
  const x64 = join(dir, `seemore-${version}-mac-x64.zip`);
  writeFileSync(arm64, 'arm64 bytes');
  writeFileSync(x64, 'x64 bytes');
  return { arm64, x64 };
}

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

describe('sign-feed', () => {
  it('writes a feed the app accepts, naming each zip by its release URL and sha256', () => {
    const { publicPem, privatePem } = keyPair();
    const files = zips('1.2.3');
    const manifest = verifyFeed(buildFeed('1.2.3', files, privatePem, publicPem), publicPem);

    expect(manifest.version).toBe('1.2.3');
    expect(manifest.arm64.url).toBe('https://github.com/arifszn/seemore/releases/download/desktop-v1.2.3/seemore-1.2.3-mac-arm64.zip');
    expect(manifest.x64.sha256).toBe(createHash('sha256').update('x64 bytes').digest('hex'));
  });

  it('refuses a private key that does not match the app’s public key', () => {
    const files = zips('1.2.3');
    expect(() => buildFeed('1.2.3', files, keyPair().privatePem, keyPair().publicPem)).toThrow(/does not match/);
  });

  it('reads the same public key the app is built with', () => {
    expect(appPublicKey()).toBe(FEED_PUBLIC_KEY);
    expect(createPublicKey(FEED_PUBLIC_KEY).asymmetricKeyType).toBe('ed25519');
  });
});
