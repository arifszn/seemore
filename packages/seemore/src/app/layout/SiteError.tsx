import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { config } from 'virtual:seemore/config';
import { withBase } from '../../shared/base.js';

/**
 * The screen for a crash outside page content: the layout, the header, the sidebar or the
 * search dialog. Set as the route's `errorElement`, so it replaces React Router's default
 * screen, which printed the stack trace in place of the site.
 *
 * It renders with none of seemore's layout or providers, because any of them may be what
 * threw. The header and sidebar are drawn as plain shapes, and the home link is a plain
 * anchor: a full page load, not a router navigation, so it does not depend on the state
 * that just failed. React Router already logs the error and its stack to the console.
 */
export function SiteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  useThemeClass();

  return (
    <div className="seemore-site-error">
      <div className="seemore-site-error-bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="seemore-site-error-body">
        <div className="seemore-site-error-side" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <main className="seemore-site-error-main">
          <div className="seemore-site-error-box">
            <h1>Something went wrong on this page</h1>
            <p>Reload to try again. If it keeps happening, go back to the home page.</p>
            <div className="seemore-site-error-actions">
              <button type="button" className="seemore-site-error-reload" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="seemore-site-error-home" href={withBase(config.base, '/')}>
                Go to home page
              </a>
            </div>
            <details className="seemore-site-error-details">
              <summary>Show details</summary>
              <pre>
                <code>{message}</code>
              </pre>
            </details>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * The theme class, when nothing set it. fumadocs' theme provider (next-themes) puts `dark`
 * or `light` on `<html>`, and the class stays after the provider is gone. But when the
 * layout throws on its first render, which in the dev server is the first render of all,
 * the provider never got to set it. This reads the same stored choice it would have.
 */
function useThemeClass() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('dark') || root.classList.contains('light')) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('theme');
    } catch {
      // Storage unavailable: fall back to the system setting.
    }
    const dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.add(dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
  }, []);
}
