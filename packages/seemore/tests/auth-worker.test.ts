import { describe, expect, it } from 'vitest';
import { createManifest, decodeBase64, deriveKek, encryptFile, type AuthManifest } from '../src/shared/auth/crypto.js';
import { sessionStorageKey } from '../src/shared/auth/files.js';
import type { KeyRecord, KeyStore } from '../src/shared/auth/store.js';
import { contentType, createAuthWorker, parseRange, type AuthRequest } from '../src/shared/auth/worker.js';

const SCOPE = 'https://docs.test/handbook/';
const PASSWORD = 'correct horse battery staple';
/** The manifest carries its own iteration count; the default is covered in auth-crypto.test.ts. */
const ITERATIONS = 1_000;
const HOUR = 3_600_000;

const encode = (text: string) => new TextEncoder().encode(text);

const navigation = (path: string): AuthRequest => ({ url: SCOPE + path, method: 'GET', navigate: true });
const request = (path: string, range?: string): AuthRequest => ({ url: SCOPE + path, method: 'GET', navigate: false, range });

/** A static host holding a protected build, a key store, and a clock — everything the worker touches. */
function harness() {
  const files = new Map<string, Uint8Array<ArrayBuffer> | string>();
  const records = new Map<string, KeyRecord>();
  const fetched: string[] = [];
  let now = 10 * HOUR;

  const store: KeyStore = {
    get: async (salt) => records.get(salt),
    put: async (salt, record) => {
      records.set(salt, record);
    },
    delete: async (salt) => {
      records.delete(salt);
    },
  };

  const worker = createAuthWorker({
    scope: SCOPE,
    store,
    now: () => now,
    publicFiles: ['favicon.png'],
    fetch: async (url) => {
      const path = decodeURIComponent(new URL(url).pathname.slice(new URL(SCOPE).pathname.length));
      fetched.push(path);
      const body = files.get(path);
      return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
    },
  });

  /** Write a build to the host: a fresh content key every time, as `seemore build` does. */
  async function deploy(options: { password?: string; remember?: number; body?: string } = {}): Promise<AuthManifest> {
    const { manifest, contentKey } = await createManifest({
      password: options.password ?? PASSWORD,
      id: 'handbook',
      remember: options.remember ?? 86_400,
      iterations: ITERATIONS,
    });
    files.set('auth.json', JSON.stringify(manifest));
    files.set('index.html', '<!doctype html><html><head></head><body>LOCK SHELL</body></html>');
    files.set('app.html', await encryptFile(contentKey, 'app.html', encode('<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>')));
    files.set('assets/entry.js', await encryptFile(contentKey, 'assets/entry.js', encode(options.body ?? 'export const build = 1;')));
    files.set('assets/doc.pdf', await encryptFile(contentKey, 'assets/doc.pdf', encode('%PDF-1.4 0123456789')));
    return manifest;
  }

  /** What the lock shell stores after a correct password. */
  async function unlock(manifest: AuthManifest, password = PASSWORD, extra: Partial<KeyRecord> = {}) {
    const kek = await deriveKek(password, decodeBase64(manifest.kdf.salt), manifest.kdf.iterations);
    records.set(manifest.kdf.salt, { kek, lastSeen: now, ...extra });
  }

  return {
    files,
    records,
    fetched,
    worker,
    deploy,
    unlock,
    advance: (ms: number) => {
      now += ms;
    },
    time: () => now,
  };
}

describe('what the worker intercepts', () => {
  const { worker } = harness();

  it('takes navigations and every non-public file under its scope', () => {
    expect(worker.intercepts(navigation(''))).toBe(true);
    expect(worker.intercepts(navigation('guide/nested/page/'))).toBe(true);
    expect(worker.intercepts(request('assets/entry.js'))).toBe(true);
    expect(worker.intercepts(request('api/search.json'))).toBe(true);
  });

  it('leaves public files, other origins, other scopes and non-GET requests to the network', () => {
    for (const path of ['auth.json', 'sw.js', 'index.html', '404.html', '_headers', 'favicon.png', '']) {
      expect(worker.intercepts(request(path)), path).toBe(false);
    }
    expect(worker.intercepts(navigation('auth.json'))).toBe(false);
    expect(worker.intercepts({ url: 'https://cdn.test/handbook/x.js', method: 'GET', navigate: false })).toBe(false);
    expect(worker.intercepts({ url: 'https://docs.test/other/x.js', method: 'GET', navigate: false })).toBe(false);
    expect(worker.intercepts({ url: `${SCOPE}assets/entry.js`, method: 'POST', navigate: false })).toBe(false);
  });
});

describe('navigations', () => {
  it('answer with the lock shell when no key is stored', async () => {
    const h = harness();
    await h.deploy();
    const response = await h.worker.handle(navigation('guide/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('LOCK SHELL');
  });

  it('answer with the lock shell, and delete the key, once `remember` has run out', async () => {
    const h = harness();
    const manifest = await h.deploy({ remember: 3_600 });
    await h.unlock(manifest);
    h.advance(HOUR + 1);

    expect(await (await h.worker.handle(navigation('guide/'))).text()).toContain('LOCK SHELL');
    expect(h.records.size).toBe(0);
  });

  it('answer with the lock shell, and delete the key, when it no longer unwraps the manifest', async () => {
    const h = harness();
    const manifest = await h.deploy();
    await h.unlock(manifest);
    await h.deploy({ password: 'a different long password' });

    expect(await (await h.worker.handle(navigation('guide/'))).text()).toContain('LOCK SHELL');
    expect(h.records.size).toBe(0);
  });

  it('answer with the decrypted app, and slide `lastSeen` forward', async () => {
    const h = harness();
    const manifest = await h.deploy({ remember: 3_600 });
    await h.unlock(manifest);
    h.advance(HOUR / 2);

    const response = await h.worker.handle(navigation('guide/nested/page/'));
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('<div id="root">');
    expect(html).not.toContain('sessionStorage');
    expect(h.records.get(manifest.kdf.salt)?.lastSeen).toBe(h.time());

    // Still inside the window measured from that visit, though past the first one.
    h.advance(HOUR * 0.75);
    expect(await (await h.worker.handle(navigation('guide/'))).text()).toContain('<div id="root">');
  });

  it('with `remember: 0`, carry the session check before anything else in the head', async () => {
    const h = harness();
    const manifest = await h.deploy({ remember: 0 });
    await h.unlock(manifest, PASSWORD, { session: 'abc123' });
    h.advance(1_000 * HOUR);

    const html = await (await h.worker.handle(navigation('guide/'))).text();
    const script = html.indexOf('<script>');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(html.indexOf('<title>'));
    expect(html).toContain(JSON.stringify(sessionStorageKey(manifest.kdf.salt)));
    expect(html).toContain('"abc123"');
  });

  it('serve a file opened directly by its address', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const response = await h.worker.handle(navigation('assets/doc.pdf'));
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(await response.text()).toBe('%PDF-1.4 0123456789');
  });
});

describe('file requests', () => {
  it('decrypt with the right content type, and never touch `lastSeen`', async () => {
    const h = harness();
    const manifest = await h.deploy();
    await h.unlock(manifest);
    const seen = h.time();
    h.advance(HOUR);

    const response = await h.worker.handle(request('assets/entry.js'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(await response.text()).toBe('export const build = 1;');
    expect(h.records.get(manifest.kdf.salt)?.lastSeen).toBe(seen);
  });

  it('are refused while locked', async () => {
    const h = harness();
    await h.deploy();
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(403);
  });

  it('pass a 404 through, so the reload-once guard can recover', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    expect((await h.worker.handle(request('assets/gone.js'))).status).toBe(404);
  });

  it('turn a host fallback page served in place of a missing file into a 404', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    h.files.set('assets/stale.js', '<!doctype html><html>fallback</html>');
    expect((await h.worker.handle(request('assets/stale.js'))).status).toBe(404);
  });

  it('after a deploy under the open tab, refetch the manifest once and retry', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    await h.worker.handle(navigation('')); // the content key is now held in memory

    await h.deploy({ body: 'export const build = 2;' });
    const manifestFetches = () => h.fetched.filter((path) => path === 'auth.json').length;
    const before = manifestFetches();

    const response = await h.worker.handle(request('assets/entry.js'));
    expect(await response.text()).toBe('export const build = 2;');
    expect(manifestFetches() - before).toBe(1);
    expect(h.fetched.filter((path) => path === 'assets/entry.js')).toHaveLength(2);
  });

  it('answer a byte range with 206, as a PDF viewer asks', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const response = await h.worker.handle(request('assets/doc.pdf', 'bytes=0-7'));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-7/19');
    expect(await response.text()).toBe('%PDF-1.4');
  });
});

describe('locking', () => {
  it('deletes the stored key and forgets the content key', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(200);

    await h.worker.lock();
    expect(h.records.size).toBe(0);
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(403);
    expect(await (await h.worker.handle(navigation(''))).text()).toContain('LOCK SHELL');
  });
});

describe('parseRange', () => {
  it('reads single byte ranges, open-ended and suffix forms included', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual([0, 99]);
    expect(parseRange('bytes=900-', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=-100', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=0-5000', 1000)).toEqual([0, 999]);
  });

  it('ignores anything it cannot satisfy exactly, serving the whole file instead', () => {
    for (const header of [null, 'bytes=500-100', 'bytes=0-1,5-9', 'items=0-1', 'bytes=-']) {
      expect(parseRange(header, 1000), String(header)).toBeUndefined();
    }
  });
});

describe('contentType', () => {
  it('maps the extensions a docs build emits', () => {
    expect(contentType('assets/a.css')).toBe('text/css; charset=utf-8');
    expect(contentType('api/search.json')).toBe('application/json');
    expect(contentType('assets/a.WASM')).toBe('application/wasm');
    expect(contentType('assets/unknown.bin')).toBe('application/octet-stream');
  });
});
