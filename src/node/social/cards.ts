import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ogImagePath } from '../../shared/og.js';
import type { OpenmdContext } from '../context.js';

/**
 * `social.cards`: one OG image per page, rendered at build time.
 *
 * `takumi-js` is an optional peer of fumadocs-ui and is not installed by default, so the
 * flag degrades to a warning rather than to an install-time cost everybody pays.
 */
export async function generateSocialCards(ctx: OpenmdContext, outDir: string): Promise<number> {
  // `takumi-js` is an optional peer, so it is loaded by specifier and typed structurally —
  // a hard import would make it a required dependency of every build.
  let takumi: TakumiModule;
  try {
    takumi = (await importOptional('takumi-js')) as TakumiModule;
  } catch {
    ctx.warnings.add(
      "`social.cards` is enabled but `takumi-js` is not installed. Run `npm install takumi-js`, or remove the flag.",
    );
    return 0;
  }

  let written = 0;
  for (const page of ctx.pages()) {
    const png = await renderCard(takumi, ctx.config.title, page.data.title, page.data.description);
    if (png === undefined) continue;

    const target = join(outDir, ogImagePath(page.url));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, png);
    written++;
  }

  return written;
}

interface TakumiModule {
  Renderer: new (options: { fonts: unknown[] }) => {
    renderAsync(node: unknown, options: { width: number; height: number; format: 'png' }): Promise<Uint8Array>;
  };
  container(props: unknown, children: unknown[]): unknown;
  text(value: string, props: unknown): unknown;
}

async function renderCard(
  takumi: TakumiModule,
  site: string,
  title: string,
  description: unknown,
): Promise<Uint8Array | undefined> {
  const renderer = new takumi.Renderer({ fonts: [] });
  const node = takumi.container(
    {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        backgroundColor: '#0b0b0b',
        color: '#ffffff',
        gap: 24,
      },
    },
    [
      takumi.text(site, { style: { fontSize: 28, opacity: 0.6 } }),
      takumi.text(title, { style: { fontSize: 64, fontWeight: 700 } }),
      ...(typeof description === 'string' ? [takumi.text(description, { style: { fontSize: 30, opacity: 0.8 } })] : []),
    ],
  );

  return await renderer.renderAsync(node, { width: 1200, height: 630, format: 'png' });
}

/** Import by a specifier TypeScript will not try to resolve at build time. */
async function importOptional(specifier: string): Promise<unknown> {
  return await import(specifier);
}
