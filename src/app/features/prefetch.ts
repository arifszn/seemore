import { useEffect } from 'react';
import { config } from 'virtual:openmd/config';
import { decodePath, stripBase } from '../../shared/base.js';
import { findRoute, loadPage } from '../lib/pages.js';
import { feature } from '../lib/features.js';

/**
 * `navigation.instant.prefetch`: load the target page's chunk on hover.
 *
 * React Router's `<Link prefetch>` is framework-mode only and does nothing in library mode,
 * so the prefetch is ours. It reads the same import map the router and prerender read, which
 * is also what makes instant previews possible.
 */
export function usePrefetch(): void {
  useEffect(() => {
    if (!feature('navigation.instant.prefetch')) return;

    const onPointerOver = (event: PointerEvent) => {
      const url = routeUrlFromEvent(event);
      if (url === undefined) return;
      const entry = findRoute(url);
      if (entry !== undefined) void loadPage(entry);
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    return () => document.removeEventListener('pointerover', onPointerOver);
  }, []);
}

/** The route URL a pointer event points at, or `undefined` if it points at nothing of ours. */
export function routeUrlFromEvent(event: Event): string | undefined {
  const target = event.target;
  if (!(target instanceof Element)) return undefined;
  const anchor = target.closest('a');
  if (anchor === null) return undefined;
  return routeUrlFromAnchor(anchor);
}

export function routeUrlFromAnchor(anchor: HTMLAnchorElement): string | undefined {
  const href = anchor.getAttribute('href');
  if (href === null || href === '' || href.startsWith('#')) return undefined;
  if (anchor.target === '_blank') return undefined;

  let pathname: string;
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return undefined;
    pathname = decodePath(url.pathname);
  } catch {
    return undefined;
  }

  const route = stripBase(config.base, pathname).replace(/\/$/, '');
  return route === '' ? '/' : route;
}
