import { compile } from '@mdx-js/mdx';
import type { Root } from 'mdast';
import type { Processor } from 'unified';
import { describe, expect, it, vi } from 'vitest';
import { VFile } from 'vfile';
import { createRemarkPlugins } from '../src/node/vite/mdx.js';

// How deep a tree must be to overflow depends on the machine's stack, so the overflow is
// simulated: the real stringifier runs, except on a tree with text `OVERFLOW` in it.
// The fallback carries that word inside a raw `html` node, which passes.
vi.mock('fumadocs-core/mdx-plugins/remark-llms', async (importOriginal) => {
  const original = await importOriginal<typeof import('fumadocs-core/mdx-plugins/remark-llms')>();
  return {
    remarkLLMs(this: Processor, ...args: Parameters<typeof original.remarkLLMs>) {
      const real = original.remarkLLMs.call(this, ...args) as (tree: Root, file: VFile) => void;
      return (tree: Root, file: VFile) => {
        if (JSON.stringify(tree).includes('"value":"OVERFLOW"')) {
          throw new RangeError('Maximum call stack size exceeded');
        }
        real(tree, file);
      };
    },
  };
});

async function run(source: string): Promise<{ code: string; warnings: string[] }> {
  const warnings: string[] = [];
  const output = await compile(new VFile({ path: '/docs/page.md', value: source }), {
    format: 'md',
    remarkPlugins: createRemarkPlugins({
      contentRoot: '/docs',
      getResolver: () => ({ resolveHref: (href: string) => ({ href }) }) as never,
      onWarning: (message) => warnings.push(message),
    }),
  });
  return { code: String(output), warnings };
}

describe('copy-as-Markdown snapshot', () => {
  it('stringifies an ordinary page', async () => {
    const { code, warnings } = await run('---\ntitle: T\n---\n\n# Hi\n\n**bold**\n');
    expect(code).toContain('export let _markdown = "\\n\\n# Hi\\n\\n**bold**\\n"');
    expect(warnings).toEqual([]);
  });

  it('falls back to the raw source when the stringifier overflows the stack', async () => {
    const { code, warnings } = await run('---\ntitle: T\n---\n\n**OVERFLOW**\n');
    expect(code).toContain('export let _markdown = "**OVERFLOW**\\n"');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/docs/page.md');
  });
});
