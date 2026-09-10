/**
 * The export's only chrome: a floating theme toggle, since the header is gone by design.
 *
 * The two glyphs ride as inline SVG with the site's own show/hide classes, so whichever
 * runtime flips `dark` also flips the icon for free. Shared as a string because both
 * export paths inline it verbatim — the browser export at run time, the CLI export at
 * build time — and the two files must ship the same button.
 */
export const THEME_TOGGLE = `<button type="button" class="seemore-export-theme-toggle" aria-label="Toggle dark mode">
<svg class="seemore-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
<svg class="seemore-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
</button>`;

/**
 * The exported file's theme, decided when the reader opens it rather than when the export
 * ran.
 *
 * The live site resolves `system` through next-themes and leaves a literal `dark`/`light`
 * class on `<html>`; serialising that would hand every reader the exporter's OS setting
 * forever. So the export strips the resolved class and ships this instead: the reader's own
 * `prefers-color-scheme` on load, their toggle choice if they have made one, and a listener
 * that keeps following the OS until they do.
 *
 * Inlined in `<head>` by both export paths so it runs before first paint — a class set from
 * the body would flash the wrong theme first. `localStorage` throws outright on some
 * `file://` origins, which is why every access is guarded; an unreadable store just means
 * the file follows the OS, which is the sane default anyway.
 */
export const THEME_INIT = `<script>(function () {
  var KEY = 'seemore-export-theme';
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var query = window.matchMedia('(prefers-color-scheme: dark)');
  var apply = function (dark) { root.classList.toggle('dark', dark); };

  apply(saved === 'dark' || saved === 'light' ? saved === 'dark' : query.matches);
  query.addEventListener('change', function (event) {
    var override = null;
    try { override = localStorage.getItem(KEY); } catch (e) {}
    if (override !== 'dark' && override !== 'light') apply(event.matches);
  });

  // The toggle lives in the body, so its click handler is bound by each export's runtime;
  // this only records the choice, which is what pins the file against the OS from then on.
  window.__seemoreRememberTheme = function () {
    try { localStorage.setItem(KEY, root.classList.contains('dark') ? 'dark' : 'light'); } catch (e) {}
  };
})();</script>`;
