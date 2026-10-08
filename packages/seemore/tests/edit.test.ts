import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { appendSource, dominantEol, spliceSource } from '../src/node/content/edit.js';
import { rehypeSeemorePositions } from '../src/node/vite/positions.js';
import { runDev, type DevServer } from '../src/cli/dev.js';

describe('splicing an edited block back into its file', () => {
  const file = '# Title\n\nFirst para.\n\nSecond para.\n';
  const start = file.indexOf('First para.');
  const end = start + 'First para.'.length;

  it('replaces only the edited range', () => {
    const result = spliceSource(file, { start, end, expected: 'First para.', text: 'Edited para.' });
    expect(result).toEqual({ ok: true, content: '# Title\n\nEdited para.\n\nSecond para.\n' });
  });

  it('refuses when the file moved under the offsets', () => {
    const moved = file.replace('# Title', '# A much longer title');
    const result = spliceSource(moved, { start, end, expected: 'First para.', text: 'Edited.' });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it('refuses a range outside the file', () => {
    const result = spliceSource(file, { start: 0, end: file.length + 10, expected: '', text: 'x' });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('keeps a CRLF file on CRLF when the browser hands back LF', () => {
    const crlf = file.replace(/\n/g, '\r\n');
    const at = crlf.indexOf('First para.');
    const result = spliceSource(crlf, {
      start: at,
      end: at + 'First para.'.length,
      expected: 'First para.',
      // What a `<textarea>` reports, whatever was put into it.
      text: 'Line one.\nLine two.',
    });
    expect(result).toEqual({ ok: true, content: crlf.replace('First para.', 'Line one.\r\nLine two.') });
    expect((result as { content: string }).content).not.toMatch(/[^\r]\n/);
  });

  it('leaves an LF file on LF', () => {
    const result = spliceSource(file, { start, end, expected: 'First para.', text: 'One.\nTwo.' });
    expect((result as { content: string }).content).toBe('# Title\n\nOne.\nTwo.\n\nSecond para.\n');
  });

  it('reads offsets as string indices, so multi-byte characters survive', () => {
    // 😀 is one code point and two UTF-16 units; the accented letters are two UTF-8 bytes each.
    const unicode = '# Título\n\nCafé — naïve 😀 emoji.\n\nÚltimo párrafo.\n';
    const at = unicode.indexOf('Café');
    const target = 'Café — naïve 😀 emoji.';
    const result = spliceSource(unicode, {
      start: at,
      end: at + target.length,
      expected: target,
      text: 'Réécrit 🎉 ici.',
    });
    expect(result).toEqual({
      ok: true,
      content: '# Título\n\nRéécrit 🎉 ici.\n\nÚltimo párrafo.\n',
    });
  });

  it('picks the line ending the file already uses', () => {
    expect(dominantEol('a\nb\nc\n')).toBe('\n');
    expect(dominantEol('a\r\nb\r\nc\r\n')).toBe('\r\n');
    // Mixed: majority wins, so a mostly-CRLF file does not drift to LF one edit at a time.
    expect(dominantEol('a\r\nb\r\nc\n')).toBe('\r\n');
  });
});

describe('appending to the end of a file', () => {
  it('writes into an empty file with no separator', () => {
    expect(appendSource('', 'Hello.')).toBe('Hello.\n');
  });

  it('starts a new block after frontmatter', () => {
    expect(appendSource('---\ntitle: Notes\n---\n', 'Hello.')).toBe('---\ntitle: Notes\n---\n\nHello.\n');
  });

  it('adds a blank line when the file has no trailing newline', () => {
    expect(appendSource('# Title', 'Hello.')).toBe('# Title\n\nHello.\n');
  });

  it('adds nothing more after an existing blank line', () => {
    expect(appendSource('# Title\n\n', 'Hello.')).toBe('# Title\n\nHello.\n');
  });

  it('ends with exactly one newline whatever was typed', () => {
    expect(appendSource('# Title\n', 'Hello.\n\n  \n')).toBe('# Title\n\nHello.\n');
  });

  it('keeps a CRLF file on CRLF, separator included', () => {
    const result = appendSource('# Title\r\n', 'One.\nTwo.');
    expect(result).toBe('# Title\r\n\r\nOne.\r\nTwo.\r\n');
    expect(result).not.toMatch(/[^\r]\n/);
  });

  it('treats a CRLF blank line as one', () => {
    expect(appendSource('# Title\r\n\r\n', 'Hello.')).toBe('# Title\r\n\r\nHello.\r\n');
  });

  it('writes nothing for blank text', () => {
    expect(appendSource('# Title\n', '  \n\t')).toBeUndefined();
  });
});

describe('stamping blocks with their source range', () => {
  const stamped = async (markdown: string) =>
    String(
      await compile(markdown, {
        rehypePlugins: [rehypeSeemorePositions],
        // Attribute syntax rather than `_jsx` props, so the assertions read as markup.
        jsx: true,
      }),
    );

  it('gives every editable block offsets that slice back to its own source', async () => {
    const markdown = '# Title\n\nA paragraph.\n\n- one\n- two\n';
    const code = await stamped(markdown);

    const ranges = [...code.matchAll(/data-seemore-pos="(\d+):(\d+)"/g)].map(
      ([, s, e]) => markdown.slice(Number(s), Number(e)),
    );
    expect(ranges).toContain('# Title');
    expect(ranges).toContain('A paragraph.');
    expect(ranges).toContain('- one');
    expect(ranges).toContain('- two');
  });

  it('keeps offsets correct in a CRLF file', async () => {
    const markdown = '# Title\r\n\r\nA paragraph.\r\n';
    const code = await stamped(markdown);

    const ranges = [...code.matchAll(/data-seemore-pos="(\d+):(\d+)"/g)].map(
      ([, s, e]) => markdown.slice(Number(s), Number(e)),
    );
    expect(ranges).toEqual(['# Title', 'A paragraph.']);
  });

  it('leaves a synthesised block unstamped rather than pointing it at the wrong source', async () => {
    // A fence is rebuilt by the highlighter and has no position to trust.
    const code = await stamped('```js\nconst a = 1;\n```\n');
    expect(code).not.toMatch(/data-seemore-pos/);
  });

  it('is absent from the output when the plugin is not installed', async () => {
    const code = String(await compile('# Title\n\nA paragraph.\n'));
    expect(code).not.toMatch(/data-seemore-pos/);
  });
});

describe('the dev server source endpoint', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  const startDev = async (markdown: string, features: Record<string, boolean>) => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-edit-'));
    writeFileSync(join(contentRoot, 'page.md'), markdown);
    writeFileSync(
      join(contentRoot, 'seemore.config.mjs'),
      `export default { title: 'Docs', features: ${JSON.stringify(features)} };\n`,
    );
    dev = await runDev({ cwd: contentRoot, port: 0 });
    return { url: dev.url.replace(/\/$/, ''), file: join(contentRoot, 'page.md') };
  };

  it('reads a block and writes an edit back to the file', async () => {
    const markdown = '# Title\n\nFirst para.\n';
    // Default-on, so mentioning no features at all is the realistic case.
    const { url, file } = await startDev(markdown, {});
    const start = markdown.indexOf('First para.');
    const end = start + 'First para.'.length;

    const read = await fetch(`${url}/__seemore/source?file=${encodeURIComponent(file)}&start=${start}&end=${end}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ text: 'First para.' });

    const write = await fetch(`${url}/__seemore/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, start, end, expected: 'First para.', text: 'Rewritten para.' }),
    });
    expect(write.status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('# Title\n\nRewritten para.\n');
  });

  it('appends to the end of the file', async () => {
    const { url, file } = await startDev('---\ntitle: Empty\n---\n', {});
    const put = (text: string) =>
      fetch(`${url}/__seemore/source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, append: true, text }),
      });

    expect((await put('First words.')).status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('---\ntitle: Empty\n---\n\nFirst words.\n');

    // Blank text is accepted and leaves the file alone.
    expect((await put('   ')).status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('---\ntitle: Empty\n---\n\nFirst words.\n');
  });

  it('reports a conflict rather than overwriting a file that changed', async () => {
    const markdown = '# Title\n\nFirst para.\n';
    const { url, file } = await startDev(markdown, { 'content.edit': true });
    const start = markdown.indexOf('First para.');
    const end = start + 'First para.'.length;

    writeFileSync(file, '# Title\n\nSomeone else got here first.\n');

    const write = await fetch(`${url}/__seemore/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, start, end, expected: 'First para.', text: 'Rewritten.' }),
    });
    expect(write.status).toBe(409);
    expect(readFileSync(file, 'utf8')).toBe('# Title\n\nSomeone else got here first.\n');
  });

  it('refuses a file that is not part of the site', async () => {
    const { url } = await startDev('# Title\n', { 'content.edit': true });
    const outsider = join(tmpdir(), 'seemore-not-a-page.md');
    writeFileSync(outsider, 'secret\n');

    try {
      const write = await fetch(`${url}/__seemore/source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: outsider, start: 0, end: 6, expected: 'secret', text: 'owned' }),
      });
      expect(write.status).toBe(404);
      expect(readFileSync(outsider, 'utf8')).toBe('secret\n');
    } finally {
      rmSync(outsider, { force: true });
    }
  });

  it('does not register the endpoint at all when the feature is switched off', async () => {
    const { url, file } = await startDev('# Title\n\nFirst para.\n', { 'content.edit': false });
    const response = await fetch(`${url}/__seemore/source?file=${encodeURIComponent(file)}&start=0&end=7`);
    // Falls through to the SPA fallback, which is HTML — not our JSON.
    expect(response.headers.get('content-type')).not.toContain('application/json');
  });
});

describe('the source endpoint only takes writes from its own pages', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  const markdown = '# Title\n\nFirst para.\n';
  const start = markdown.indexOf('First para.');
  const end = start + 'First para.'.length;

  const setup = async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-origin-'));
    writeFileSync(join(contentRoot, 'page.md'), markdown);
    dev = await runDev({ cwd: contentRoot, port: 0 });
    const origin = new URL(dev.url).origin;
    const file = join(contentRoot, 'page.md');
    const put = (headers: Record<string, string>) =>
      fetch(`${origin}/__seemore/source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ file, start, end, expected: 'First para.', text: 'Changed.' }),
      });
    return { origin, file, put };
  };

  it('refuses a write from another localhost origin, and leaves the file alone', async () => {
    const { file, put } = await setup();

    const res = await put({ Origin: 'http://localhost:9999' });
    expect(res.status).toBe(403);
    expect(readFileSync(file, 'utf8')).toBe(markdown);
  });

  it('accepts a write from its own origin', async () => {
    const { origin, file, put } = await setup();

    expect((await put({ Origin: origin })).status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('# Title\n\nChanged.\n');
  });

  it('accepts a write with no Origin, as a host calling from Node sends', async () => {
    const { put } = await setup();
    expect((await put({})).status).toBe(200);
  });

  it('answers a cross-origin preflight without CORS headers', async () => {
    const { origin } = await setup();

    const res = await fetch(`${origin}/__seemore/source`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:9999',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
