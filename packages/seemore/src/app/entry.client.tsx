import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { config } from 'virtual:seemore/config';
import { decodePath, stripBase, toBasename } from '../shared/base.js';
import { createRouteObjects } from './router.js';
import { preloadPage } from './lib/pages.js';
import './styles/globals.css';

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
