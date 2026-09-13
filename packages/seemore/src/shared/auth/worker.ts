/**
 * The service worker's decisions, as a pure module.
 *
 * Every dependency — the network, the key store, the clock — arrives as an argument, so Node
 * tests drive it without a browser. `sw.ts` is the thin wrapper that wires it to real events.
 *
 * Navigations get the lock shell or the decrypted app; every other request under the scope
 * that is not a public file is fetched, decrypted with the content key held in memory, and
 * answered with the right type — so the app's own imports, images, PDFs and search index load
 * unchanged.
 */
import { decryptFile, isEncrypted, parseManifest, unlockManifest, type AuthManifest } from './crypto.js';
import { APP_FILE, LOCK_MESSAGE, MANIFEST_FILE, PUBLIC_FILES, sessionStorageKey } from './files.js';
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
}

export interface AuthWorker {
  /** Whether the worker answers this request at all. */
  intercepts(request: AuthRequest): boolean;
  handle(request: AuthRequest): Promise<Response>;
  /** Forget the stored key and the content key: the Lock button, or a `remember: 0` mismatch. */
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

  const urlFor = (path: string) => new URL(path, scope).href;

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

  async function loadManifest(): Promise<AuthManifest> {
    const response = await options.fetch(urlFor(MANIFEST_FILE), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${MANIFEST_FILE} answered ${response.status}.`);
    return parseManifest(await response.json());
  }

  async function lockShell(): Promise<Response> {
    const response = await options.fetch(urlFor('index.html'), { cache: 'no-cache' });
    if (!response.ok) return response;
    return new Response(await response.arrayBuffer(), { status: 200, headers: htmlHeaders() });
  }

  async function forget(salt: string): Promise<void> {
    unlocked = undefined;
    await options.store.delete(salt);
  }

  /** The content key, from memory or re-derived from the stored KEK. Concurrent callers share one derivation. */
  function currentKey(): Promise<Unlocked | undefined> {
    if (unlocked !== undefined) return Promise.resolve(unlocked);
    unlocking ??= (async () => {
      try {
        const manifest = await loadManifest();
        const record = await options.store.get(manifest.kdf.salt);
        if (record === undefined) return undefined;
        const contentKey = await unlockManifest(manifest, record.kek);
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
    let key = await currentKey();
    if (key === undefined) return new Response(null, { status: 403 });

    let bytes = await fetchCiphertext(url, cache);
    if (bytes instanceof Response) return bytes;

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
    const manifest = await loadManifest();
    const salt = manifest.kdf.salt;

    const record = await options.store.get(salt);
    if (record === undefined) return await lockShell();

    if (manifest.remember > 0 && options.now() - record.lastSeen > manifest.remember * 1000) {
      await forget(salt);
      return await lockShell();
    }

    try {
      unlocked = { salt, contentKey: await unlockManifest(manifest, record.kek) };
    } catch {
      // The stored key no longer opens the manifest: the password changed.
      await forget(salt);
      return await lockShell();
    }

    // Sliding expiry, measured from the last navigation — never per asset.
    await options.store.put(salt, { ...record, lastSeen: options.now() });

    // An address with a file extension may be a file opened directly (a PDF link); anything
    // that does not decrypt as one is a route.
    if (looksLikeFile(path)) {
      const file = await decrypted(request.url, path, request.range ?? null, 'default');
      if (file.ok) return file;
    }

    const app = await decrypted(urlFor(APP_FILE), APP_FILE, null, 'no-cache');
    // The app would not open even after a fresh manifest — a deploy caught half-uploaded. The
    // lock shell is a page the visitor can act on; an empty error response is not.
    if (!app.ok) return await lockShell();

    let html = await app.text();
    if (manifest.remember === 0) html = injectHeadScript(html, sessionBootstrap(salt, record.session));
    return new Response(html, { status: 200, headers: htmlHeaders() });
  }

  return {
    intercepts(request) {
      if (request.method !== 'GET') return false;
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
      const salt = unlocked?.salt ?? (await loadManifest()).kdf.salt;
      await forget(salt);
    },
  };
}

/**
 * With `remember: 0` the site stays open only while the unlocking tab does. A worker cannot
 * read `sessionStorage`, so this runs in the page before any module script: if the tab does
 * not hold the session id the unlock wrote, it stops the document, has the worker forget the
 * key, and reloads into the lock shell.
 */
export function sessionBootstrap(salt: string, session: string | undefined): string {
  const key = JSON.stringify(sessionStorageKey(salt));
  const expected = JSON.stringify(session ?? null);
  const message = JSON.stringify({ type: LOCK_MESSAGE });
  return (
    `(function(){var held=null;try{held=sessionStorage.getItem(${key})}catch(e){}` +
    `if(${expected}!==null&&held===${expected})return;` +
    `window.stop();document.documentElement.innerHTML="";` +
    `var gone=false,done=function(){if(!gone){gone=true;location.reload()}};` +
    `var worker=navigator.serviceWorker&&navigator.serviceWorker.controller;if(!worker)return done();` +
    `var channel=new MessageChannel();channel.port1.onmessage=done;` +
    `worker.postMessage(${message},[channel.port2]);setTimeout(done,3000)})();`
  );
}

export function injectHeadScript(html: string, script: string): string {
  const inline = `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (open) => open + inline) : inline + html;
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

  const [start, end] = span;
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

/** A single `bytes=` range, as a PDF viewer asks for. Anything else gets the whole file. */
export function parseRange(header: string | null, size: number): [number, number] | undefined {
  const match = header === null ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null || size === 0) return undefined;
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return undefined;

  if (from === '') {
    const suffix = Math.min(Number(to), size);
    return suffix === 0 ? undefined : [size - suffix, size - 1];
  }

  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  return start > end ? undefined : [start, end];
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
