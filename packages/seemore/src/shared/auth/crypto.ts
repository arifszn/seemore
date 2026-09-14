/**
 * Password protection's cryptography.
 *
 * All of it is WebCrypto — `globalThis.crypto.subtle` exists in the browser, in a service
 * worker and in Node ≥ 20 — so the build that encrypts and the browser that decrypts share
 * this one implementation.
 *
 * Envelope encryption: the password derives a key-encryption key (KEK), which wraps a random
 * content key made fresh by every build. Visitors keep the KEK, so a deploy with the same
 * password never logs them out, and old ciphertext can never be mixed with new.
 */

export const KDF_ITERATIONS = 600_000;

/** `SMP1`: the first four bytes of every encrypted file. */
export const MAGIC = new Uint8Array([0x53, 0x4d, 0x50, 0x31]);

const IV_BYTES = 12;
const HEADER_BYTES = MAGIC.length + IV_BYTES;
const SALT_PREFIX = 'seemore-auth-v1\0';

/** `auth.json`: public, and holds nothing a guess can be checked against but the wrapped key. */
export interface AuthManifest {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  /** The content key, wrapped with the KEK (AES-KW), base64. */
  key: string;
  /** Seconds a visitor stays unlocked after their last visit; 0 means only while the tab is open. */
  remember: number;
}

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

/** A password typed on macOS and on Windows must derive the same key. */
export function normalisePassword(password: string): string {
  return password.normalize('NFC');
}

/**
 * Derived from the site's stable name, not random: a random salt per build would log every
 * visitor out on every deploy. Prefixed, so the digest is never a plain hash of the title.
 */
export async function deriveSalt(id: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest('SHA-256', encoder.encode(SALT_PREFIX + id)));
}

/** Non-extractable: page code can use the stored key, never read its bytes. */
export async function deriveKek(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(normalisePassword(password)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return await subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function generateContentKey(): Promise<CryptoKey> {
  return await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapContentKey(contentKey: CryptoKey, kek: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().wrapKey('raw', contentKey, kek, 'AES-KW'));
}

/**
 * A wrong password fails here: AES-KW carries its own integrity check. That failure is the
 * password check — there is no separate verifier to attack.
 */
export async function unwrapContentKey(wrapped: Uint8Array<ArrayBuffer>, kek: CryptoKey): Promise<CryptoKey> {
  return await subtle().unwrapKey('raw', wrapped, kek, 'AES-KW', 'AES-GCM', false, ['decrypt']);
}

/**
 * `SMP1 || iv || ciphertext+tag`. The file's published path is the associated data, so a
 * ciphertext moved to another path fails authentication.
 */
export async function encryptFile(
  key: CryptoKey,
  path: string,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(path), tagLength: 128 },
    key,
    plaintext,
  );
  const out = new Uint8Array(HEADER_BYTES + sealed.byteLength);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(new Uint8Array(sealed), HEADER_BYTES);
  return out;
}

export function isEncrypted(bytes: Uint8Array): boolean {
  return bytes.length > HEADER_BYTES && MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function decryptFile(
  key: CryptoKey,
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!isEncrypted(bytes)) throw new Error(`${path} is not an encrypted file.`);
  const iv = bytes.slice(MAGIC.length, HEADER_BYTES);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(path), tagLength: 128 },
    key,
    bytes.subarray(HEADER_BYTES),
  );
  return new Uint8Array(plain);
}

export interface CreatedManifest {
  manifest: AuthManifest;
  contentKey: CryptoKey;
}

/** A fresh content key, wrapped for this password and site name. */
export async function createManifest(options: {
  password: string;
  id: string;
  remember: number;
  iterations?: number;
}): Promise<CreatedManifest> {
  const iterations = options.iterations ?? KDF_ITERATIONS;
  const salt = await deriveSalt(options.id);
  const kek = await deriveKek(options.password, salt, iterations);
  const contentKey = await generateContentKey();

  return {
    contentKey,
    manifest: {
      v: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: encodeBase64(salt) },
      key: encodeBase64(await wrapContentKey(contentKey, kek)),
      remember: options.remember,
    },
  };
}

export function parseManifest(value: unknown): AuthManifest {
  const manifest = value as Partial<AuthManifest> | null;
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    manifest.v !== 1 ||
    typeof manifest.key !== 'string' ||
    typeof manifest.remember !== 'number' ||
    !(manifest.remember > 0) ||
    typeof manifest.kdf?.salt !== 'string' ||
    typeof manifest.kdf.iterations !== 'number'
  ) {
    throw new Error('auth.json is not a manifest this version of seemore can read.');
  }
  return manifest as AuthManifest;
}

export async function deriveManifestKek(password: string, manifest: AuthManifest): Promise<CryptoKey> {
  return await deriveKek(password, decodeBase64(manifest.kdf.salt), manifest.kdf.iterations);
}

export async function unlockManifest(manifest: AuthManifest, kek: CryptoKey): Promise<CryptoKey> {
  return await unwrapContentKey(decodeBase64(manifest.key), kek);
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
