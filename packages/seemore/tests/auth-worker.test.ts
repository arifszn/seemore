import { describe, expect, it } from 'vitest';
import { createManifest, decodeBase64, deriveKek, encryptFile, type AuthManifest } from '../src/shared/auth/crypto.js';
import { recordId } from '../src/shared/auth/files.js';
import type { KeyRecord, KeyStore } from '../src/shared/auth/store.js';
import { contentType, createAuthWorker, parseRange, type AuthRequest } from '../src/shared/auth/worker.js';

const SCOPE = 'https://docs.test/handbook/';
const PASSWORD = 'correct horse battery staple';
/** The manifest carries its own iteration count; the default is covered in auth-crypto.test.ts. */
const ITERATIONS = 1_000;
const HOUR = 3_600_000;
const shell = (base: string, text: string) =>
  `<!doctype html><html><head><script type="application/json" id="seemore-auth-config">${JSON.stringify({ base })}</script></head><body>${text}</body></html>`;
const LOCK_SHELL = shell('/handbook/', 'LOCK SHELL');

const encode = (text: string) => new TextEncoder().encode(text);

const navigation = (path: string): AuthRequest => ({ url: SCOPE + path, method: 'GET', navigate: true });
const request = (path: string, range?: string): AuthRequest => ({ url: SCOPE + path, method: 'GET', navigate: false, range });

/** A static host holding a protected build, a key store, and a clock — everything the worker touches. */
function harness() {
  const files = new Map<string, Uint8Array<ArrayBuffer> | string>();
  const records = new Map<string, KeyRecord>();
  const fetched: string[] = [];
  const unreachable = new Set<string>();
  let retired = 0;
  let now = 10 * HOUR;
  let held: { reached: () => void; released: Promise<void> } | undefined;

  const store: KeyStore = {
    // Reads the record first, then waits if held: a slow IndexedDB read that raced a delete.
    get: async (id) => {
      const found = records.get(id);
      const hold = held;
      held = undefined;
      if (hold !== undefined) {
        hold.reached();
        await hold.released;
      }
      return found;
    },
    put: async (id, record) => {
      records.set(id, record);
    },
    delete: async (id) => {
      records.delete(id);
    },
  };

  const served = (body: Uint8Array<ArrayBuffer> | string, status: number) =>
    new Response(body, { status, headers: typeof body === 'string' && body.startsWith('<') ? { 'Content-Type': 'text/html' } : {} });

  const worker = createAuthWorker({
    scope: SCOPE,
    store,
    now: () => now,
    publicFiles: ['favicon.png'],
    retire: () => {
      retired += 1;
    },
    // Like a static host: a folder answers with its index.html, anything missing with 404.html.
    fetch: async (url) => {
      const path = decodeURIComponent(new URL(url).pathname.slice(new URL(SCOPE).pathname.length));
      fetched.push(path);
      if (unreachable.has(path)) throw new TypeError('Failed to fetch');
      const body = files.get(path === '' || path.endsWith('/') ? `${path}index.html` : path) ?? files.get(path);
      if (body !== undefined) return served(body, 200);
      const fallback = files.get('404.html');
      return fallback === undefined ? new Response('not found', { status: 404 }) : served(fallback, 404);
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
    files.set('index.html', LOCK_SHELL);
    files.set('404.html', LOCK_SHELL);
    files.set('app.html', await encryptFile(contentKey, 'app.html', encode('<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>')));
    files.set('assets/entry.js', await encryptFile(contentKey, 'assets/entry.js', encode(options.body ?? 'export const build = 1;')));
    files.set('assets/doc.pdf', await encryptFile(contentKey, 'assets/doc.pdf', encode('%PDF-1.4 0123456789')));
    return manifest;
  }

  /** What the lock shell stores after a correct password. */
  async function unlock(manifest: AuthManifest, password = PASSWORD) {
    const kek = await deriveKek(password, decodeBase64(manifest.kdf.salt), manifest.kdf.iterations);
    records.set(recordId(SCOPE, manifest.kdf.salt), { kek, lastSeen: now });
  }

  return {
    files,
    records,
    fetched,
    unreachable,
    worker,
    deploy,
    unlock,
    record: (manifest: AuthManifest) => records.get(recordId(SCOPE, manifest.kdf.salt)),
    retired: () => retired,
    /** Hold the next key-store read after it has read the record, until released. */
    holdNextGet: () => {
      let reached!: () => void;
      let release!: () => void;
      const hasRead = new Promise<void>((resolve) => (reached = resolve));
      held = { reached, released: new Promise<void>((resolve) => (release = resolve)) };
      return { hasRead, release };
    },
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
    expect(await response.text()).toContain('<div id="root">');
    expect(h.record(manifest)?.lastSeen).toBe(h.time());

    // Still inside the window measured from that visit, though past the first one.
    h.advance(HOUR * 0.75);
    expect(await (await h.worker.handle(navigation('guide/'))).text()).toContain('<div id="root">');
  });

  it('serve a file opened directly by its address', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const response = await h.worker.handle(navigation('assets/doc.pdf'));
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(await response.text()).toBe('%PDF-1.4 0123456789');
  });

  it("neither use nor delete another site's key on the same origin", async () => {
    const h = harness();
    const manifest = await h.deploy();
    const otherKek = await deriveKek('another site password', decodeBase64(manifest.kdf.salt), ITERATIONS);
    const other = recordId('https://docs.test/other/', manifest.kdf.salt);
    h.records.set(other, { kek: otherKek, lastSeen: h.time() });

    expect(await (await h.worker.handle(navigation(''))).text()).toContain('LOCK SHELL');
    expect(h.records.has(other)).toBe(true);
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
    expect(h.record(manifest)?.lastSeen).toBe(seen);
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

  it('turn the lock shell served with a 200 in place of a missing file into a 404', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    h.files.set('assets/stale.js', LOCK_SHELL);
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

  it('answer a range past the end with 416', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const response = await h.worker.handle(request('assets/doc.pdf', 'bytes=19-'));
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */19');
  });
});

describe('content that is not the protected site', () => {
  it('passes another site under the same scope through, locked or unlocked', async () => {
    const h = harness();
    const manifest = await h.deploy();
    h.files.set('other/index.html', '<!doctype html><html><body>OTHER SITE</body></html>');
    h.files.set('other/app.js', 'console.log("other");');

    for (const step of ['locked', 'unlocked']) {
      if (step === 'unlocked') await h.unlock(manifest);
      expect(await (await h.worker.handle(navigation('other/'))).text(), step).toContain('OTHER SITE');
      expect(await (await h.worker.handle(request('other/app.js'))).text(), step).toBe('console.log("other");');
    }
    expect(h.retired()).toBe(0);
    expect(h.worker.intercepts(navigation(''))).toBe(true);
  });

  it('after a redeploy without `auth`, passes the plain site through and retires', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    expect(await (await h.worker.handle(navigation(''))).text()).toContain('<div id="root">');

    h.files.clear();
    h.files.set('index.html', '<!doctype html><html><body>PLAIN SITE</body></html>');
    h.files.set('assets/entry.js', 'export const plain = true;');

    expect(await (await h.worker.handle(request('assets/entry.js'))).text()).toBe('export const plain = true;');
    expect(await (await h.worker.handle(navigation(''))).text()).toContain('PLAIN SITE');
    expect(h.retired()).toBe(1);
    expect(h.worker.intercepts(navigation(''))).toBe(false);
    expect(h.worker.intercepts(request('assets/entry.js'))).toBe(false);
  });

  it('passes a protected site nested under the scope through, so it can show its own lock screen', async () => {
    const h = harness();
    const manifest = await h.deploy();
    h.files.set('other/index.html', shell('/handbook/other/', 'OTHER LOCK SHELL'));

    for (const step of ['locked', 'unlocked']) {
      if (step === 'unlocked') await h.unlock(manifest);
      expect(await (await h.worker.handle(navigation('other/'))).text(), step).toContain('OTHER LOCK SHELL');
    }
    expect(h.retired()).toBe(0);
  });

  it('answers other content with the request as the browser made it, Range header included', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    h.files.set('other/video.mp4', 'plain video bytes');

    const sent = new Response('plai', { status: 206, headers: { 'Content-Range': 'bytes 0-3/17' } });
    const ranged = { ...request('other/video.mp4', 'bytes=0-3'), send: async () => sent };
    expect(await h.worker.handle(ranged)).toBe(sent);

    const page = new Response('<!doctype html><html><body>OTHER</body></html>', { headers: { 'Content-Type': 'text/html' } });
    expect(await h.worker.handle({ ...navigation('other/'), send: async () => page })).toBe(page);
  });

  it('opens a file directly from the one download it already made', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    await h.worker.handle(navigation('assets/doc.pdf'));
    expect(h.fetched.filter((path) => path === 'assets/doc.pdf')).toHaveLength(1);
  });

  it('does not retire when the manifest only failed to load', async () => {
    const h = harness();
    await h.deploy();
    h.files.set('other/index.html', '<!doctype html><html><body>OTHER SITE</body></html>');
    h.unreachable.add('auth.json');

    expect(await (await h.worker.handle(navigation('other/'))).text()).toContain('OTHER SITE');
    expect(h.retired()).toBe(0);
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

  it('keeps a key derivation already under way from bringing the key back', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const hold = h.holdNextGet();
    const pending = h.worker.handle(request('assets/entry.js'));
    await hold.hasRead;

    await h.worker.lock();
    hold.release();
    expect((await pending).status).toBe(403);
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(403);
  });

  it('keeps a navigation already under way from restoring the stored key', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    const hold = h.holdNextGet();
    const pending = h.worker.handle(navigation('guide/'));
    await hold.hasRead;

    await h.worker.lock();
    hold.release();
    expect(await (await pending).text()).toContain('LOCK SHELL');
    expect(h.records.size).toBe(0);
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(403);
  });

  it('forgets the content key when a navigation finds the stored key deleted by the page', async () => {
    const h = harness();
    await h.unlock(await h.deploy());
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(200);

    h.records.clear();
    expect(await (await h.worker.handle(navigation(''))).text()).toContain('LOCK SHELL');
    expect((await h.worker.handle(request('assets/entry.js'))).status).toBe(403);
  });
});

describe('parseRange', () => {
  it('reads single byte ranges, open-ended and suffix forms included', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual([0, 99]);
    expect(parseRange('bytes=900-', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=-100', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=0-5000', 1000)).toEqual([0, 999]);
  });

  it('marks a range that starts past the end as unsatisfiable', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=2000-3000', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('ignores anything else, serving the whole file instead', () => {
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
