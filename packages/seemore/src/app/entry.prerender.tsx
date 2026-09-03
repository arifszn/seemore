import { Writable } from 'node:stream';
import { StrictMode, type ReactNode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { config } from 'virtual:seemore/config';
import { toBasename, withBase } from '../shared/base.js';
import { ogImagePath } from '../shared/og.js';
import { createRouteObjects } from './router.js';
import { findRoute, preloadPage, routeEntries } from './lib/pages.js';

export interface RenderResult {
  html: string;
  head: string;
}

/**
 * The prerender driver.
 *
 * The page's module is loaded first, so `use()` resolves synchronously and the renderer
 * emits the complete article rather than a Suspense fallback. No route has a loader, so the
 * memory router is initialised the moment it is created.
 */
export async function render(url: string): Promise<RenderResult> {
  await preloadPage(url);

  const router = createMemoryRouter(createRouteObjects(), {
    basename: toBasename(config.base),
    initialEntries: [withBase(config.base, url)],
  });

  const { html, failures } = await renderToHtml(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

  // React hands a render error to the nearest Suspense boundary and carries on. Without this
  // the page would be written out as the loading fallback — an empty shell — and the build
  // would report it as a success.
  if (failures.length > 0) throw prerenderError(url, failures[0]);

  return { html, head: head(url) };
}

/**
 * The whole tree as one string, plus anything that threw while rendering it.
 *
 * `renderToString` would be shorter, but it swallows render errors: its own `onError` is
 * internal and a failed subtree is silently replaced by its Suspense fallback. The streaming
 * renderer reports them, and piping only once `onAllReady` has fired keeps the output the
 * same complete markup — no fallbacks, no streaming scripts.
 */
function renderToHtml(element: ReactNode): Promise<{ html: string; failures: unknown[] }> {
  return new Promise((resolve) => {
    const failures: unknown[] = [];
    const chunks: Buffer[] = [];

    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    sink.on('finish', () => {
      resolve({ html: Buffer.concat(chunks).toString('utf8'), failures });
    });

    const stream = renderToPipeableStream(element, {
      onError(error: unknown) {
        failures.push(error);
      },
      onAllReady() {
        stream.pipe(sink);
      },
      // Nothing was rendered at all: there is no markup to hand back, and `failures` already
      // holds the reason.
      onShellError() {
        resolve({ html: '', failures });
      },
    });
  });
}

/** Components an MDX file can use without importing anything. */
const PROVIDED_COMPONENTS = 'Callout, Card, Cards, CodeBlockTabs, Mermaid, D2 and Pdf';

/**
 * A page that threw, reported the way the rest of the build reports problems: the file it
 * came from, what went wrong, and — for the common case of an MDX file reaching for a
 * component that is not there — the fix.
 */
function prerenderError(url: string, cause: unknown): Error {
  const file = findRoute(url)?.file;
  const message = cause instanceof Error ? cause.message : String(cause);
  const undefinedComponent = /Expected component `(.+?)` to be defined/.exec(message);

  const hint =
    undefinedComponent === null
      ? ''
      : `\n\n  \`<${undefinedComponent[1]}>\` is not one of the components seemore provides ` +
        `(${PROVIDED_COMPONENTS}), and a Markdown file has no imports to add one with. ` +
        `Remove it, or write the markup by hand.`;

  return new Error(`${file ?? url} failed to render.\n\n  ${message}${hint}`, { cause });
}

export function listRoutes(): string[] {
  return routeEntries().map((entry) => entry.url);
}

function head(url: string): string {
  const entry = findRoute(url);
  const title = entry === undefined || url === '/' ? config.title : `${entry.title} · ${config.title}`;
  const description = entry?.description ?? config.description;

  const tags = [`<title>${escapeHtml(title)}</title>`];
  if (description != null) tags.push(`<meta name="description" content="${escapeHtml(description)}" />`);
  if (config.favicon !== undefined) tags.push(`<link rel="icon" href="${escapeHtml(config.favicon)}" />`);

  tags.push(`<meta property="og:title" content="${escapeHtml(title)}" />`);
  if (description != null) tags.push(`<meta property="og:description" content="${escapeHtml(description)}" />`);

  if (config.features['social.cards']) {
    const card = escapeHtml(withBase(config.base, ogImagePath(url)));
    tags.push(`<meta property="og:image" content="${card}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${card}" />`);
  }

  return tags.join('\n    ');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
