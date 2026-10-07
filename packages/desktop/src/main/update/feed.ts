/**
 * The macOS update feed, `latest-mac.json` (DESKTOP-SPEC §10.3 steps 1 and 2): `{ payload,
 * signature }`, where `signature` is Ed25519 over the exact bytes of the `payload` string.
 * The payload is parsed only after the signature checks out.
 */
import { verify } from 'node:crypto';

export const FEED_URL = 'https://github.com/arifszn/seemore/releases/latest/download/latest-mac.json';

export interface MacAsset {
  url: string;
  sha256: string;
}

export interface MacManifest {
  version: string;
  arm64: MacAsset;
  x64: MacAsset;
}

export class FeedError extends Error {}

export function verifyFeed(body: unknown, publicKeyPem: string): MacManifest {
  if (publicKeyPem === '') throw new FeedError('This build has no update key.');
  const { payload, signature } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof payload !== 'string' || typeof signature !== 'string') throw new FeedError('The update feed is malformed.');

  let valid: boolean;
  try {
    valid = verify(null, Buffer.from(payload, 'utf8'), publicKeyPem, Buffer.from(signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) throw new FeedError('The update feed has a bad signature.');

  const manifest = JSON.parse(payload) as Partial<MacManifest>;
  const version = manifest.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new FeedError('The update feed has no valid version.');
  }
  // Signed, but checked anyway: assets only ever come from this release.
  const prefix = `https://github.com/arifszn/seemore/releases/download/desktop-v${version}/`;
  const asset = (value: unknown): MacAsset => {
    const { url, sha256 } = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    if (typeof url !== 'string' || !url.startsWith(prefix) || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new FeedError('The update feed has an invalid asset.');
    }
    return { url, sha256 };
  };
  return { version, arm64: asset(manifest.arm64), x64: asset(manifest.x64) };
}
