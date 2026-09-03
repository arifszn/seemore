import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { dominantEol, spliceSource } from '../src/node/content/edit.js';
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

  const startDev = async (markdown: string, features: string[]) => {
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
    // Default-on, so an empty feature list is the realistic case.
    const { url, file } = await startDev(markdown, []);
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

  it('reports a conflict rather than overwriting a file that changed', async () => {
    const markdown = '# Title\n\nFirst para.\n';
    const { url, file } = await startDev(markdown, ['content.edit']);
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
    const { url } = await startDev('# Title\n', ['content.edit']);
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
    const { url, file } = await startDev('# Title\n\nFirst para.\n', ['!content.edit']);
    const response = await fetch(`${url}/__seemore/source?file=${encodeURIComponent(file)}&start=0&end=7`);
    // Falls through to the SPA fallback, which is HTML — not our JSON.
    expect(response.headers.get('content-type')).not.toContain('application/json');
  });
});
