import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '@mdx-js/mdx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VFile } from 'vfile';
import { rehypeSeemoreMedia } from '../src/node/vite/media.js';
import { rehypeSeemoreRawHtml } from '../src/node/vite/raw.js';

describe('rehypeSeemoreMedia', () => {
  let contentRoot: string;
  let warnings: string[];

  beforeEach(() => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-media-'));
    mkdirSync(join(contentRoot, 'clips'));
    writeFileSync(join(contentRoot, 'clips', 'demo.webm'), 'webm');
    writeFileSync(join(contentRoot, 'clips', 'demo.mp4'), 'mp4');
    warnings = [];
  });

  afterEach(() => {
    rmSync(contentRoot, { recursive: true, force: true });
  });

  async function run(name: string, source: string): Promise<string> {
    const file = new VFile({ path: join(contentRoot, name), value: source });
    const output = await compile(file, {
      rehypePlugins: [
        rehypeSeemoreRawHtml,
        () => rehypeSeemoreMedia({ contentRoot, onWarning: (message) => warnings.push(message) }),
      ],
    });
    return String(output);
  }

  it('imports local sources of a raw <video> in a .md file', async () => {
    const code = await run(
      'page.md',
      [
        '<video controls muted width="320" data-kind="demo" style="max-width: 100%">',
        '  <source src="clips/demo.webm" type="video/webm">',
        '  <source src="clips/demo.mp4" type="video/mp4">',
        '</video>',
      ].join('\n'),
    );

    expect(code).toContain('import __seemoreMedia0 from "./clips/demo.webm"');
    expect(code).toContain('import __seemoreMedia1 from "./clips/demo.mp4"');
    expect(code).toContain('src: __seemoreMedia0');
    expect(code).toContain('"data-kind": "demo"');
    expect(code).toContain('maxWidth: "100%"');
    expect(warnings).toEqual([]);
  });

  it('imports a <video src> written as JSX in a .mdx file', async () => {
    const code = await run('page.mdx', '<video src="clips/demo.webm" poster="clips/missing.png" controls />');

    expect(code).toContain('import __seemoreMedia0 from "./clips/demo.webm"');
    expect(code).toContain('src: __seemoreMedia0');
    expect(code).toContain('poster: "clips/missing.png"');
    expect(warnings).toEqual(['Missing asset clips/missing.png referenced by page.mdx.']);
  });

  it('leaves remote and root-absolute sources alone', async () => {
    const code = await run(
      'page.md',
      '<video src="https://example.com/a.mp4"></video>\n\n<video src="/static/b.mp4"></video>',
    );

    expect(code).not.toContain('__seemoreMedia');
    expect(code).toContain('"https://example.com/a.mp4"');
    expect(code).toContain('"/static/b.mp4"');
    expect(warnings).toEqual([]);
  });

  it('warns about a missing local file and leaves the tag as written', async () => {
    const code = await run('page.md', '<video src="clips/missing.mp4"></video>');

    expect(code).not.toContain('__seemoreMedia');
    expect(warnings).toEqual(['Missing asset clips/missing.mp4 referenced by page.md.']);
  });
});
