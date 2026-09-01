import { useEffect, useState } from 'react';
import { config } from 'virtual:openmd/config';
import { findRoute, loadPage, peekPage } from '../lib/pages.js';
import { feature } from '../lib/features.js';
import { mdxComponents } from '../mdx/components.js';
import { routeUrlFromEvent } from './prefetch.js';

interface PreviewState {
  url: string;
  x: number;
  y: number;
}

/**
 * `navigation.instant.preview`: a hover popover rendering the target page inline.
 *
 * This is the reason the prefetch module exists independently of any router: it needs to
 * load *and render* the target module, which no router's preload gives you.
 */
export function PagePreview() {
  const [state, setState] = useState<PreviewState>();
  const enabled = feature('navigation.instant.preview');

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onPointerOver = (event: PointerEvent) => {
      const url = routeUrlFromEvent(event);
      const entry = url === undefined ? undefined : findRoute(url);
      if (entry === undefined) return;

      clearTimeout(timer);
      timer = setTimeout(() => {
        void loadPage(entry).then(() => {
          setState({ url: entry.url, x: event.clientX, y: event.clientY });
        });
      }, 350);
    };

    const onPointerOut = () => {
      clearTimeout(timer);
      setState(undefined);
    };

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
    };
  }, [enabled]);

  if (!enabled || state === undefined) return null;

  const loaded = peekPage(state.url);
  if (loaded === undefined) return null;
  const Content = loaded.default;

  return (
    <div
      className="openmd-preview"
      role="tooltip"
      style={{ left: Math.min(state.x + 16, window.innerWidth - 420), top: state.y + 16 }}
    >
      <p className="openmd-preview-title">{findRoute(state.url)?.title ?? config.title}</p>
      <div className="openmd-preview-body" aria-hidden="true">
        <Content components={mdxComponents} />
      </div>
    </div>
  );
}
