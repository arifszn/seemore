import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VFile } from 'vfile';
import type { Paragraph, PhrasingContent, Root } from 'mdast';
import { remarkSeemoreAssets, remarkSeemoreEmoji } from '../src/node/vite/remark.js';

describe('remarkSeemoreAssets', () => {
  let contentRoot: string;

  afterEach(() => {
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  function run(url: string): { paragraph: Paragraph; warnings: string[] } {
    const tree: Root = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'image', url, alt: 'diagram' }] }],
    };
    const warnings: string[] = [];
    remarkSeemoreAssets({
      contentRoot,
      getResolver: () => {
        throw new Error('remarkSeemoreAssets never resolves links');
      },
      onWarning: (message) => warnings.push(message),
    })(tree, new VFile({ path: join(contentRoot, 'page.md') }), () => {});
    return { paragraph: tree.children[0] as Paragraph, warnings };
  }

  it('checks a stray-% URL literally instead of failing the transform', () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-remark-'));
    writeFileSync(join(contentRoot, '50%.png'), 'png');

    const { paragraph, warnings } = run('50%.png');

    expect(warnings).toEqual([]);
    expect(paragraph.children[0]).toMatchObject({ type: 'image', url: '50%.png' });
  });

  it('warns and leaves a visible placeholder for a missing stray-% asset', () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-remark-'));

    const { paragraph, warnings } = run('50%.png');

    expect(warnings).toEqual(['Missing asset 50%.png referenced by page.md.']);
    const placeholder = paragraph.children[0] as { attributes: { name: string; value: string }[] };
    expect(placeholder).toMatchObject({ type: 'mdxJsxTextElement', name: 'img' });
    expect(placeholder.attributes).toContainEqual({
      type: 'mdxJsxAttribute',
      name: 'data-seemore-missing',
      value: 'true',
    });
  });

  it('resolves percent-encoded names to the on-disk file', () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-remark-'));
    writeFileSync(join(contentRoot, 'my file.png'), 'png');

    const { paragraph, warnings } = run('my%20file.png');

    expect(warnings).toEqual([]);
    expect(paragraph.children[0]).toMatchObject({ type: 'image', url: 'my%20file.png' });
  });
});

describe('remarkSeemoreEmoji', () => {
  function run(...children: PhrasingContent[]): PhrasingContent[] {
    const tree: Root = { type: 'root', children: [{ type: 'paragraph', children }] };
    remarkSeemoreEmoji()(tree, new VFile(), () => {});
    return (tree.children[0] as Paragraph).children;
  }

  it('converts GitHub shortcodes and the Slack names for colored shapes', () => {
    const children = run({
      type: 'text',
      value: ':white_circle: not started · :large_yellow_circle: in progress · :white_check_mark: done · :red_circle: blocked :+1:',
    });

    expect(children.every((node) => node.type === 'text')).toBe(true);
    expect(children.map((node) => (node as { value: string }).value).join('')).toBe(
      '⚪ not started · 🟡 in progress · ✅ done · 🔴 blocked 👍',
    );
  });

  it('leaves unknown names, times and inline code as written', () => {
    const children = run(
      { type: 'text', value: ':not_an_emoji: at 10:30:00 ' },
      { type: 'inlineCode', value: ':red_circle:' },
    );

    expect(children).toEqual([
      { type: 'text', value: ':not_an_emoji: at 10:30:00 ' },
      { type: 'inlineCode', value: ':red_circle:' },
    ]);
  });
});
