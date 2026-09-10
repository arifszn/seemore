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
