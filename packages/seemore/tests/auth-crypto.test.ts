import { describe, expect, it } from 'vitest';
import {
  createManifest,
  decodeBase64,
  decryptFile,
  deriveKek,
  deriveSalt,
  encryptFile,
  generateContentKey,
  isEncrypted,
  KDF_ITERATIONS,
  unlockManifest,
  unwrapContentKey,
  wrapContentKey,
} from '../src/shared/auth/crypto.js';
import { resolveConfig } from '../src/node/config/load.js';

const PASSWORD = 'correct horse battery staple';
/** Enough to exercise the derivation; the default count gets its own test. */
const FAST = 1_000;

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function kekFor(password: string, id = 'handbook') {
  return await deriveKek(password, await deriveSalt(id), FAST);
}

describe('file encryption', () => {
  it('round-trips a file behind the SMP1 header', async () => {
    const key = await generateContentKey();
    const sealed = await encryptFile(key, 'assets/3f9a1c.js', encode('export const secret = 1;'));

    expect(decode(sealed.subarray(0, 4))).toBe('SMP1');
    expect(isEncrypted(sealed)).toBe(true);
    expect(decode(sealed)).not.toContain('secret');
    expect(decode(await decryptFile(key, 'assets/3f9a1c.js', sealed))).toBe('export const secret = 1;');
  });

  it('uses a fresh IV per file, so equal plaintexts never produce equal ciphertexts', async () => {
    const key = await generateContentKey();
    const a = await encryptFile(key, 'a.js', encode('same'));
    const b = await encryptFile(key, 'a.js', encode('same'));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('fails authentication when a ciphertext is moved to another path', async () => {
    const key = await generateContentKey();
    const sealed = await encryptFile(key, 'assets/one.js', encode('one'));
    await expect(decryptFile(key, 'assets/two.js', sealed)).rejects.toThrow();
  });

  it('fails authentication when a byte is tampered with', async () => {
    const key = await generateContentKey();
    const sealed = await encryptFile(key, 'app.html', encode('<html></html>'));
    sealed[sealed.length - 5] = (sealed[sealed.length - 5] ?? 0) ^ 0xff;
    await expect(decryptFile(key, 'app.html', sealed)).rejects.toThrow();
  });

  it('does not mistake plaintext for ciphertext', () => {
    expect(isEncrypted(encode('<!doctype html>'))).toBe(false);
    expect(isEncrypted(encode('SMP1'))).toBe(false);
  });
});

describe('key envelope', () => {
  it('fails to unwrap with the wrong password — the unwrap is the password check', async () => {
    const contentKey = await generateContentKey();
    const wrapped = await wrapContentKey(contentKey, await kekFor(PASSWORD));
    await expect(unwrapContentKey(wrapped, await kekFor('correct horse battery stapler'))).rejects.toThrow();
    await expect(unwrapContentKey(wrapped, await kekFor(PASSWORD))).resolves.toBeDefined();
  });

  it('makes a new content key every build, and the stored KEK opens every one of them', async () => {
    const first = await createManifest({ password: PASSWORD, id: 'handbook', remember: 86_400, iterations: FAST });
    const second = await createManifest({ password: PASSWORD, id: 'handbook', remember: 86_400, iterations: FAST });

    const raw = async (key: CryptoKey) => Buffer.from(await crypto.subtle.exportKey('raw', key));
    expect((await raw(first.contentKey)).equals(await raw(second.contentKey))).toBe(false);
    expect(second.manifest.kdf.salt).toBe(first.manifest.kdf.salt);

    // A visitor who unlocked build 1 holds this KEK; build 2's key must open with it.
    const kek = await deriveKek(PASSWORD, decodeBase64(first.manifest.kdf.salt), FAST);
    const opened = await unlockManifest(second.manifest, kek);
    const sealed = await encryptFile(second.contentKey, 'app.html', encode('build two'));
    expect(decode(await decryptFile(opened, 'app.html', sealed))).toBe('build two');
  });

  it('derives with PBKDF2-SHA256 at 600,000 iterations by default', async () => {
    const { manifest } = await createManifest({ password: PASSWORD, id: 'handbook', remember: 86_400 });
    expect(manifest.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(KDF_ITERATIONS).toBe(600_000);
    expect(manifest).toMatchObject({ v: 1, remember: 86_400 });
    expect(decodeBase64(manifest.kdf.salt)).toHaveLength(32);
  });
});

describe('password normalisation', () => {
  it('derives the same key from NFC and NFD input, as macOS and Windows type it', async () => {
    const nfc = 'café crème brûlée'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);

    const contentKey = await generateContentKey();
    const wrapped = await wrapContentKey(contentKey, await kekFor(nfc));
    await expect(unwrapContentKey(wrapped, await kekFor(nfd))).resolves.toBeDefined();
  });
});

describe('salt', () => {
  const saltOf = async (config: Parameters<typeof resolveConfig>[0]) => {
    const auth = resolveConfig(config, { root: '/tmp/x' }).auth;
    if (auth === undefined) throw new Error('auth is off');
    return Buffer.from(await deriveSalt(auth.id)).toString('base64');
  };

  it('is identical across builds of the same site', async () => {
    expect(await saltOf({ title: 'Handbook', auth: true })).toBe(await saltOf({ title: 'Handbook', auth: true }));
  });

  it('follows the title when there is no id, so a rename logs visitors out once', async () => {
    expect(await saltOf({ title: 'Handbook', auth: true })).not.toBe(await saltOf({ title: 'Staff Handbook', auth: true }));
  });

  it('follows only the id when one is set, so a rename keeps visitors unlocked', async () => {
    const before = await saltOf({ title: 'Handbook', auth: { id: 'acme-handbook' } });
    expect(await saltOf({ title: 'Staff Handbook', auth: { id: 'acme-handbook' } })).toBe(before);
    expect(await saltOf({ title: 'Handbook', auth: { id: 'acme-staff' } })).not.toBe(before);
  });

  it('is never a bare hash of the name', async () => {
    const bare = Buffer.from(await crypto.subtle.digest('SHA-256', encode('Handbook'))).toString('base64');
    expect(await saltOf({ title: 'Handbook', auth: true })).not.toBe(bare);
  });
});
