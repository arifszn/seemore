import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { config } from 'virtual:openmd/config';
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
 * The page's module is loaded first, so `use()` resolves synchronously and `renderToString`
 * emits the complete article rather than a Suspense fallback. No route has a loader, so the
 * memory router is initialised the moment it is created.
 */
export async function render(url: string): Promise<RenderResult> {
  await preloadPage(url);

  const router = createMemoryRouter(createRouteObjects(), {
    basename: toBasename(config.base),
    initialEntries: [withBase(config.base, url)],
  });

  const html = renderToString(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

  return { html, head: head(url) };
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
