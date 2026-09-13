/**
 * The service worker's decisions, as a pure module.
 *
 * Every dependency — the network, the key store, the clock — arrives as an argument, so Node
 * tests drive it without a browser. `sw.ts` is the thin wrapper that wires it to real events.
 *
 * The worker takes over only what the site itself serves: its lock shell, and ciphertext.
 * Navigations to the site get the lock shell or the decrypted app; its files are decrypted with
 * the content key held in memory and answered with the right type, so the app's own imports,
 * images, PDFs and search index load unchanged. Anything else under the scope — another site
 * sharing the origin, or this site after `auth` was turned off — passes through untouched.
 */
import { MAGIC, decryptFile, isEncrypted, parseManifest, unlockManifest, type AuthManifest } from './crypto.js';
import { APP_FILE, MANIFEST_FILE, PUBLIC_FILES, SHELL_CONFIG_ID, recordId } from './files.js';
import type { KeyStore } from './store.js';

/** The parts of a `Request` the worker reads; a plain object, because Node cannot build a navigation `Request`. */
export interface AuthRequest {
  url: string;
  method: string;
  /** `request.mode === 'navigate'`. */
  navigate: boolean;
  range?: string | null;
}

export interface AuthWorkerOptions {
  /** Absolute URL of the registration scope, with its trailing slash. */
  scope: string;
  store: KeyStore;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  /** Public files beyond {@link PUBLIC_FILES} — the configured favicon. */
  publicFiles?: readonly string[];
  /** Called once the site is no longer protected (its manifest is gone); `sw.ts` unregisters. */
  retire?: () => Promise<void> | void;
}

export interface AuthWorker {
  /** Whether the worker answers this request at all. */
  intercepts(request: AuthRequest): boolean;
  handle(request: AuthRequest): Promise<Response>;
  /** Forget the stored key and the content key: the Lock button. */
  lock(): Promise<void>;
}

interface Unlocked {
  salt: string;
  contentKey: CryptoKey;
}

export function createAuthWorker(options: AuthWorkerOptions): AuthWorker {
  const scope = new URL(options.scope);
  const publicFiles = new Set<string>([...PUBLIC_FILES, ...(options.publicFiles ?? [])]);

  // Lives only in worker memory. A browser stops idle workers, and the next request
  // re-derives it from the stored KEK and the manifest.
  let unlocked: Unlocked | undefined;
  let unlocking: Promise<Unlocked | undefined> | undefined;
  let retired = false;

  const urlFor = (path: string) => new URL(path, scope).href;
  const record = (salt: string) => recordId(scope.href, salt);

  function pathOf(url: string): string | undefined {
    const parsed = new URL(url);
    if (parsed.origin !== scope.origin || !parsed.pathname.startsWith(scope.pathname)) return undefined;
    const raw = parsed.pathname.slice(scope.pathname.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  /** The manifest, or `undefined` when the host no longer has one. Throws when the host cannot be reached. */
  async function loadManifest(): Promise<AuthManifest | undefined> {
    const response = await options.fetch(urlFor(MANIFEST_FILE), { cache: 'no-store' });
    if (response.status === 404 || response.status === 410) return undefined;
    if (!response.ok) throw new Error(`${MANIFEST_FILE} answered ${response.status}.`);
    try {
      return parseManifest(await response.json());
    } catch {
      // A host fallback page served in place of a missing manifest.
      return undefined;
    }
  }

  /** The site was redeployed without `auth`: stop intercepting, and let `sw.ts` unregister. */
  async function retire(): Promise<void> {
    if (retired) return;
    retired = true;
    unlocked = undefined;
    await options.retire?.();
  }

  async function lockShell(): Promise<Response> {
    const response = await options.fetch(urlFor('index.html'), { cache: 'no-cache' });
    if (!response.ok) return response;
    return new Response(await response.arrayBuffer(), { status: 200, headers: htmlHeaders() });
  }

  async function forget(salt: string): Promise<void> {
    unlocked = undefined;
    await options.store.delete(record(salt));
  }

  /** The content key, from memory or re-derived from the stored KEK. Concurrent callers share one derivation. */
  function currentKey(): Promise<Unlocked | undefined> {
    if (unlocked !== undefined) return Promise.resolve(unlocked);
    unlocking ??= (async () => {
      try {
        const manifest = await loadManifest();
        if (manifest === undefined) return undefined;
        const stored = await options.store.get(record(manifest.kdf.salt));
        if (stored === undefined) return undefined;
        const contentKey = await unlockManifest(manifest, stored.kek);
        unlocked = { salt: manifest.kdf.salt, contentKey };
        return unlocked;
      } catch {
        return undefined;
      } finally {
        unlocking = undefined;
      }
    })();
    return unlocking;
  }

  /** Ciphertext from the network, or the response to pass on instead. */
  async function fetchCiphertext(url: string, cache: RequestCache): Promise<Uint8Array<ArrayBuffer> | Response> {
    const response = await options.fetch(url, { cache });
    if (!response.ok) return response;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A host's fallback page for a file that no longer exists, served with a 200.
    return isEncrypted(bytes) ? bytes : notFound();
  }

  async function decrypted(url: string, path: string, range: string | null, cache: RequestCache): Promise<Response> {
    const response = await options.fetch(url, { cache });
    if (!response.ok) return response;
    if (!(await startsEncrypted(response.clone()))) {
      // The lock shell as a host's fallback for a file that no longer exists, or a file that is
      // not this site's at all.
      return (await isLockShell(response.clone())) ? notFound() : response;
    }

    let key = await currentKey();
    if (key === undefined) return new Response(null, { status: 403 });

    let bytes: Uint8Array<ArrayBuffer> | Response = new Uint8Array(await response.arrayBuffer());
    try {
      return respond(await decryptFile(key.contentKey, path, bytes), path, range);
    } catch {
      // A deploy happened under the open tab: a new content key, and perhaps a stale cached
      // copy of the file. Unwrap the new manifest and try once more, bypassing the cache.
      unlocked = undefined;
      key = await currentKey();
      if (key === undefined) return new Response(null, { status: 403 });

      bytes = await fetchCiphertext(url, 'reload');
      if (bytes instanceof Response) return bytes;
      try {
        return respond(await decryptFile(key.contentKey, path, bytes), path, range);
      } catch {
        return notFound();
      }
    }
  }

  async function navigate(request: AuthRequest, path: string): Promise<Response> {
    // Asked of the network first, so a page that is not this site's is never taken over. Every
    // route of a protected site answers with the lock shell (`index.html`, `404.html` or
    // `200.html`); a file opened directly answers with ciphertext.
    const page = await options.fetch(request.url, { cache: 'no-cache', redirect: 'manual' });
    const ours = page.ok || page.status === 404 ? (await startsEncrypted(page.clone())) || (await isLockShell(page.clone())) : false;
    if (!ours) {
      // Another site sharing the origin, or this site redeployed without `auth`.
      if ((await loadManifest().catch(() => null)) === undefined) await retire();
      return page;
    }

    const manifest = await loadManifest();
    if (manifest === undefined) {
      await retire();
      return page;
    }
    void page.body?.cancel().catch(() => undefined);
    const salt = manifest.kdf.salt;

    const stored = await options.store.get(record(salt));
    if (stored === undefined) return await lockShell();

    if (options.now() - stored.lastSeen > manifest.remember * 1000) {
      await forget(salt);
      return await lockShell();
    }

    try {
      unlocked = { salt, contentKey: await unlockManifest(manifest, stored.kek) };
    } catch {
      // The stored key no longer opens the manifest: the password changed.
      await forget(salt);
      return await lockShell();
    }

    // Sliding expiry, measured from the last navigation — never per asset.
    await options.store.put(record(salt), { ...stored, lastSeen: options.now() });

    // An address with a file extension may be a file opened directly (a PDF link); anything
    // that does not decrypt as one is a route.
    if (looksLikeFile(path)) {
      const file = await decrypted(request.url, path, request.range ?? null, 'default');
      if (file.ok) return file;
    }

    const app = await decrypted(urlFor(APP_FILE), APP_FILE, null, 'no-cache');
    // The app would not open even after a fresh manifest — a deploy caught half-uploaded. The
    // lock shell is a page the visitor can act on; an empty error response is not.
    if (!app.ok || !isHtml(app)) return await lockShell();
    return new Response(await app.arrayBuffer(), { status: 200, headers: htmlHeaders() });
  }

  return {
    intercepts(request) {
      if (retired || request.method !== 'GET') return false;
      const path = pathOf(request.url);
      if (path === undefined) return false;
      if (request.navigate) return !(publicFiles.has(path) && !path.endsWith('.html'));
      return path !== '' && !publicFiles.has(path);
    },

    async handle(request) {
      const path = pathOf(request.url) ?? '';
      if (request.navigate) return await navigate(request, path);
      return await decrypted(request.url, path, request.range ?? null, 'default');
    },

    async lock() {
      const salt = unlocked?.salt ?? (await loadManifest())?.kdf.salt;
      unlocked = undefined;
      if (salt !== undefined) await forget(salt);
    },
  };
}

/** Whether a response body begins with the encrypted-file magic, reading no more than that. */
async function startsEncrypted(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (reader === undefined) return false;
  const head: number[] = [];
  try {
    while (head.length < MAGIC.length) {
      const { done, value } = await reader.read();
      if (done) break;
      head.push(...value.subarray(0, MAGIC.length - head.length));
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return MAGIC.every((byte, index) => head[index] === byte);
}

/** The site's own lock shell, recognised by its config element. */
async function isLockShell(response: Response): Promise<boolean> {
  if (!isHtml(response)) return false;
  return (await response.text()).includes(`id="${SHELL_CONFIG_ID}"`);
}

function isHtml(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').includes('text/html');
}

function looksLikeFile(path: string): boolean {
  const last = path.split('/').pop() ?? '';
  return /\.[a-z0-9]+$/i.test(last) && !/\.html?$/i.test(last);
}

function htmlHeaders(): Headers {
  return new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function respond(bytes: Uint8Array<ArrayBuffer>, path: string, range: string | null): Response {
  const headers = new Headers({ 'Content-Type': contentType(path), 'Accept-Ranges': 'bytes' });
  const span = parseRange(range, bytes.length);
  if (span === undefined) return new Response(bytes, { status: 200, headers });
  if (span === 'unsatisfiable') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });

  const [start, end] = span;
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

/**
 * A single `bytes=` range, as a PDF viewer asks for: the span to send, `'unsatisfiable'` when it
 * starts past the end, or `undefined` for anything else, which gets the whole file.
 */
export function parseRange(header: string | null, size: number): [number, number] | 'unsatisfiable' | undefined {
  const match = header === null ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null || size === 0) return undefined;
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return undefined;

  if (from === '') {
    const suffix = Math.min(Number(to), size);
    return suffix === 0 ? 'unsatisfiable' : [size - suffix, size - 1];
  }

  const start = Number(from);
  if (to !== '' && Number(to) < start) return undefined;
  if (start >= size) return 'unsatisfiable';
  return [start, to === '' ? size - 1 : Math.min(Number(to), size - 1)];
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  map: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  wasm: 'application/wasm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export function contentType(path: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
