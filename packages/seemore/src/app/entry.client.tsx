import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { config } from 'virtual:seemore/config';
import { decodePath, stripBase, toBasename } from '../shared/base.js';
import { createRouteObjects } from './router.js';
import { onVitePreloadError } from './lib/chunkReload.js';
import { preloadPage } from './lib/pages.js';
import './styles/globals.css';

// Vite dispatches this when a chunk preload fails and rethrows when it is not cancelled.
// One reload picks up the new chunk names after a deploy; the guard keeps a genuinely
// broken chunk from looping.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    onVitePreloadError(sessionStorage, Date.now(), () => window.location.reload());
  } catch {
    // Storage unavailable (private mode): a reload without a guard could loop.
  }
});

const container = document.getElementById('root');
if (container === null) throw new Error('seemore: #root is missing from the page shell.');

const router = createBrowserRouter(createRouteObjects(), { basename: toBasename(config.base) });

function mount(target: HTMLElement) {
  const app = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  // The dev server serves an empty shell (rendering happens here, in the browser), so there
  // is nothing to hydrate; hydrating an empty container makes React log a hydration-mismatch
  // error on every load. Only a prerendered build puts element content inside #root.
  if (target.children.length === 0) {
    createRoot(target).render(app);
  } else {
    hydrateRoot(target, app);
  }
}

// Hydrating against prerendered HTML needs the current page's module in hand, or React would
// hydrate a Suspense fallback over real markup.
const current = stripBase(config.base, decodePath(window.location.pathname)).replace(/\/$/, '') || '/';
void preloadPage(current).then(
  () => mount(container),
  () => mount(container),
);
