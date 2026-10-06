import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';
import { VFile } from 'vfile';
import { createRemarkPlugins } from '../src/node/vite/mdx.js';

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

  it('falls back to the raw source when nesting is too deep to stringify', async () => {
    const deep = `${'*'.repeat(1600)}x${'*'.repeat(1600)}`;
    const { code, warnings } = await run(`---\ntitle: T\n---\n\n${deep}\n`);
    expect(code).toContain(`export let _markdown = "${deep}\\n"`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/docs/page.md');
  });
});
