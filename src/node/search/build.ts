import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createFromSource } from 'fumadocs-core/search/server';
import { structure } from 'fumadocs-core/mdx-plugins';
import { withBase } from '../base.js';
import { parseFrontmatter } from '../content/frontmatter.js';
import type { OpenmdContext } from '../context.js';

/** Above this, a static index is a real download cost worth naming. */
export const SIZE_WARNING_BYTES = 1_500_000;

/**
 * Build the static search index.
 *
 * The index is produced node-side from the raw markdown rather than from the compiled MDX
 * modules, so dev and build share one code path and neither has to evaluate browser code.
 */
export async function buildSearchIndex(ctx: OpenmdContext): Promise<string> {
  const loader = await ctx.source.loader.get();
  const bodies = new Map<string, string>();

  for (const page of ctx.pages()) {
    try {
      // The body only: `structure` reads plain Markdown, where a frontmatter block's closing
      // `---` turns its keys into a setext heading and lands in the index as content.
      bodies.set(page.url, parseFrontmatter(readFileSync(page.absPath, 'utf8'), page.file).content);
    } catch {
      // A file deleted between scan and index is not worth failing a dev rebuild over.
    }
  }

  const server = createFromSource(loader, {
    buildIndex(page) {
      const body = bodies.get(page.url) ?? '';
      return {
        id: page.url,
        url: withBase(ctx.config.base, page.url),
        title: typeof page.data.title === 'string' ? page.data.title : page.url,
        description: typeof page.data.description === 'string' ? page.data.description : undefined,
        structuredData: structure(body),
      };
    },
  });

  const response = await server.staticGET();
  return await response.text();
}

export interface IndexSize {
  bytes: number;
  gzipped: number;
  /** Set when the gzipped index passed {@link SIZE_WARNING_BYTES}. */
  warning?: string;
}

export function measureIndex(json: string): IndexSize {
  const bytes = Buffer.byteLength(json);
  const gzipped = gzipSync(json).byteLength;

  if (gzipped <= SIZE_WARNING_BYTES) return { bytes, gzipped };

  return {
    bytes,
    gzipped,
    warning:
      `The static search index is ${formatBytes(gzipped)} gzipped, which every visitor downloads before ` +
      `their first search. Above ${formatBytes(SIZE_WARNING_BYTES)} consider a hosted index: set ` +
      `\`search: { provider: 'orama-cloud', … }\` or \`search: { provider: 'algolia', … }\` in openmd.config.ts.`,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
