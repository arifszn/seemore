import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { config } from 'virtual:openmd/config';
import { stripBase, toBasename } from '../shared/base.js';
import { createRouteObjects } from './router.js';
import { preloadPage } from './lib/pages.js';
import './styles/globals.css';

const container = document.getElementById('root');
if (container === null) throw new Error('openmd: #root is missing from the page shell.');

const router = createBrowserRouter(createRouteObjects(), { basename: toBasename(config.base) });

function mount(target: HTMLElement) {
  hydrateRoot(
    target,
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

// Hydrating against prerendered HTML needs the current page's module in hand, or React would
// hydrate a Suspense fallback over real markup.
const current = stripBase(config.base, window.location.pathname).replace(/\/$/, '') || '/';
void preloadPage(current).then(
  () => mount(container),
  () => mount(container),
);
