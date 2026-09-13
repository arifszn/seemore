import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBuild } from '../src/cli/build.js';
import { assertOutputEncrypted, listFiles, publicFiles } from '../src/node/auth/output.js';
import { decryptFile, deriveManifestKek, isEncrypted, parseManifest, unlockManifest } from '../src/shared/auth/crypto.js';
import { PUBLIC_FILES, SHELL_CONFIG_ID } from '../src/shared/auth/files.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'site');
const PASSWORD = 'correct horse battery staple';
const TITLE = 'Vault Fixture';
const DESCRIPTION = 'Encrypted fixture description.';

/** Everything a copy of `dist/` must not reveal without the password. */
const SECRETS = {
  pageTitles: ['seemore fixture', 'Getting started', 'Guide', 'Deep Dive', 'Nested page', 'Internal notes', 'Reference page', 'Página Uno'],
  bodies: [
    'THE FULL PAGE TEXT IS PRESENT',
    'Install it, point it at a folder, done.',
    'The guide index.',
    'DEEP DIVE SENTINEL TEXT',
    'Content under the second heading',
    'NESTED SENTINEL TEXT',
    'UNDERSCORE SENTINEL TEXT',
    'The shallower of the two',
    'UNICODE SENTINEL TEXT',
  ],
  slugSegments: ['getting-started', 'guide', 'deep-dive', 'nested', 'page', '_internal', 'notes', 'reference', 'guía', 'página-uno'],
  basenames: ['Deep Dive', 'notes', 'spec.pdf', 'diagram.svg', 'README', 'getting-started.md', 'Página Uno'],
  password: [PASSWORD],
};

describe('seemore build with auth', () => {
  let root: string;
  let outDir: string;
  let result: { routes: number };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-auth-'));
    outDir = join(root, 'dist');
    writeFileSync(
      join(root, 'seemore.config.ts'),
      `export default { title: '${TITLE}', description: '${DESCRIPTION}', auth: { remember: '1h' } };`,
    );
    process.env.SEEMORE_PASSWORD = PASSWORD;
    try {
      result = await runBuild({ cwd: FIXTURE, configPath: join(root, 'seemore.config.ts'), outDir });
    } finally {
      delete process.env.SEEMORE_PASSWORD;
    }
  }, 300_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const read = (path: string) => readFileSync(join(outDir, path));
  const isPublic = (path: string) => publicFiles(undefined).includes(path);

  it('writes only the public files in plain text, and encrypts every other file', () => {
    const files = listFiles(outDir);
    expect(files.filter(isPublic).sort()).toEqual([...PUBLIC_FILES].sort());

    const others = files.filter((path) => !isPublic(path));
    expect(others).toContain('app.html');
    expect(others).toContain('api/search.json');
    expect(others.some((path) => path.endsWith('.js'))).toBe(true);
    for (const path of others) expect(read(path).subarray(0, 4).toString('latin1'), path).toBe('SMP1');
  });

  it('writes no per-route HTML, so no slug is published as a path', () => {
    expect(existsSync(join(outDir, 'guide'))).toBe(false);
    expect(existsSync(join(outDir, '_internal'))).toBe(false);
    expect(result.routes).toBe(8);
  });

  it('names no output file after its source', () => {
    for (const path of listFiles(outDir)) {
      for (const name of ['Deep Dive', 'Deep', 'spec', 'diagram', 'README', 'Página', 'worker', 'notes']) {
        expect(path, `${path} carries "${name}"`).not.toContain(name);
      }
    }
  });

  /**
   * The leak test: the raw bytes of every file, public or not, searched for everything the
   * site must keep. Four-byte needles are searched in the public files only: in megabytes of
   * random ciphertext a given four bytes turns up by chance about once in three hundred builds,
   * where five bytes is already one in a hundred thousand.
   */
  it('leaks no page title, body text, slug, source name or the password in any file', () => {
    const files = listFiles(outDir).map((path) => ({ path, bytes: read(path) }));
    const needles = Object.values(SECRETS).flat();

    for (const needle of needles) {
      const bytes = Buffer.from(needle, 'utf8');
      for (const file of files) {
        if (bytes.length < 5 && !isPublic(file.path)) continue;
        expect(file.bytes.indexOf(bytes), `"${needle}" found in ${file.path}`).toBe(-1);
      }
    }
  });

  it('shows the site title and description on the lock shell, identical at every entry point', () => {
    const shell = read('index.html').toString('utf8');
    expect(read('404.html').toString('utf8')).toBe(shell);
    expect(read('200.html').toString('utf8')).toBe(shell);

    const $ = load(shell);
    expect($('title').text()).toBe(TITLE);
    expect($('h1').text()).toBe(TITLE);
    expect($('meta[name="description"]').attr('content')).toBe(DESCRIPTION);
    expect($('input[type="password"]').length).toBe(1);
    // The worker tells the lock shell apart from any other page by this element.
    expect($(`script#${SHELL_CONFIG_ID}`).length).toBe(1);
    expect($('link[rel="icon"]').attr('href')).toMatch(/^data:image\/svg\+xml,/);
  });

  it('keeps search engines off: noindex on every shell, X-Robots-Tag for every path, no robots.txt', () => {
    for (const file of ['index.html', '404.html', '200.html']) {
      expect(load(read(file).toString('utf8'))('meta[name="robots"]').attr('content'), file).toBe('noindex, nofollow');
    }
    expect(read('_headers').toString('utf8')).toBe('/*\n  X-Robots-Tag: noindex, nofollow\n');
    expect(existsSync(join(outDir, 'robots.txt'))).toBe(false);
  });

  it('keeps the host fallbacks pointing at the shell', () => {
    expect(read('_redirects').toString('utf8')).toBe('/*    /index.html    200\n');
    expect(existsSync(join(outDir, '.nojekyll'))).toBe(true);
  });

  it('writes a manifest and a worker the browser can use', () => {
    const manifest = parseManifest(JSON.parse(read('auth.json').toString('utf8')));
    expect(manifest.remember).toBe(3_600);
    expect(read('sw.js').toString('utf8')).toMatch(/^var SEEMORE_AUTH=\{"publicFiles":\[/);
  });

  it('opens with the password: the app template and the search index decrypt', async () => {
    const manifest = parseManifest(JSON.parse(read('auth.json').toString('utf8')));
    const contentKey = await unlockManifest(manifest, await deriveManifestKek(PASSWORD, manifest));
    const decrypt = async (path: string) =>
      new TextDecoder().decode(await decryptFile(contentKey, path, new Uint8Array(read(path))));

    const $ = load(await decrypt('app.html'));
    expect($('#root').length).toBe(1);
    expect($('#root').children().length).toBe(0);
    expect($('title').text()).toBe(TITLE);
    expect($('meta[name="robots"]').attr('content')).toBe('noindex, nofollow');
    expect($('script[type="module"]').attr('src')).toMatch(/^\/assets\/[\w-]+\.js$/);

    expect(await decrypt('api/search.json')).toContain('/guide/deep-dive');
  });

  it('fails the build, naming the file, when anything escaped encryption', () => {
    const leak = join(outDir, 'assets', 'forgotten.js');
    writeFileSync(leak, 'console.log("plaintext");');
    try {
      expect(isEncrypted(readFileSync(leak))).toBe(false);
      expect(() => assertOutputEncrypted(outDir, publicFiles(undefined))).toThrow(/assets\/forgotten\.js[\s\S]*bug in seemore/);
    } finally {
      rmSync(leak);
    }
    expect(() => assertOutputEncrypted(outDir, publicFiles(undefined))).not.toThrow();
  });
});

describe('seemore build with auth: failures', () => {
  it('fails before writing anything when SEEMORE_PASSWORD is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'seemore-auth-fail-'));
    const outDir = join(root, 'dist');
    writeFileSync(join(root, 'seemore.config.ts'), "export default { title: 'Vault', auth: true };");
    const build = () => runBuild({ cwd: FIXTURE, configPath: join(root, 'seemore.config.ts'), outDir });

    try {
      delete process.env.SEEMORE_PASSWORD;
      await expect(build()).rejects.toThrow(/SEEMORE_PASSWORD is not set/);
      expect(existsSync(outDir)).toBe(false);
    } finally {
      delete process.env.SEEMORE_PASSWORD;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
