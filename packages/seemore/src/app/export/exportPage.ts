import { config } from 'virtual:seemore/config';
import { THEME_TOGGLE } from './themeToggle.js';

/**
 * The single-page export: the article you are reading, in one HTML file that renders
 * offline.
 *
 * Everything happens client-side against the live DOM, which is what makes the same code
 * work in the dev server, on a hosted static build, and inside an editor webview — none of
 * the three owe the export a server. The page gives up three things in exchange: it runs
 * after hydration (diagrams must already be rendered or renderable), it needs the network
 * only for assets that are themselves remote, and it serialises the DOM as it is — site
 * chrome never enters the file because only the article is taken.
 *
 * The same preparation drives the PDF path: print is the browser's own renderer, so the
 * feature contributes a print stylesheet (see `globals.css`) and a light theme, not a PDF
 * library.
 */

/** Mermaid and D2 render on scroll-into-view; the export needs every diagram as SVG. */
async function prepareDiagrams(): Promise<void> {
  const pending = Array.from(document.querySelectorAll<HTMLElement>('.seemore-mermaid, .seemore-d2')).filter(
    (el) => el.querySelector('svg') === null && el.querySelector('.seemore-mermaid-error, .seemore-d2-error') === null,
  );
  if (pending.length === 0) return;

  // Walking the page to wake each diagram moves the reader; put them back afterwards.
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (const el of pending) {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    // A settled diagram shows either its SVG or the component's own error note. A timeout
    // gives up on that one diagram rather than on the export: the site itself renders
    // nothing better on a failed diagram, and the Markdown source `pre` it leaves behind
    // is still honest content.
    await waitFor(
      () => el.querySelector('svg, .seemore-mermaid-error, .seemore-d2-error') !== null,
      15_000,
    );
  }

  window.scrollTo(scrollX, scrollY);
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (predicate() || Date.now() - started > timeoutMs) return resolve();
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

/**
 * Every rule the page is styled by, as one string.
 *
 * Dev injects `<style>` tags (one per module, sometimes several identical ones across
 * reloads); the build ships a single hashed stylesheet link. Same-origin sheets are inlined
 * — a `file://` page cannot fetch them — and a sheet that is genuinely remote stays linked,
 * the same treaty as remote images.
 */
async function collectCss(): Promise<{ css: string; remoteLinks: string }> {
  const seen = new Set<string>();
  const parts: string[] = [];
  const remote: string[] = [];

  for (const style of document.querySelectorAll('style')) {
    // The highlight rule is installed per-navigation and means nothing in a static file.
    if (style.id === 'seemore-highlight-style') continue;
    const text = style.textContent ?? '';
    if (text.trim() === '' || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    let url: URL;
    try {
      url = new URL(link.href, document.baseURI);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) {
      remote.push(link.outerHTML);
      continue;
    }
    const text = await fetch(url.href)
      .then((response) => response.text())
      .catch(() => undefined);
    if (text === undefined || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }

  return { css: parts.join('\n'), remoteLinks: remote.join('\n') };
}

/** Rewrite same-origin `url(...)` references to data URIs; remote and broken ones stay. */
async function inlineCssUrls(css: string): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const replacements = new Map<string, string>();

  for (const match of css.matchAll(pattern)) {
    const raw = match[2] ?? '';
    if (/^(?:data:|https?:)/i.test(raw) === false && !raw.startsWith('#')) {
      try {
        const url = new URL(raw, document.baseURI);
        if (url.origin === location.origin) {
          const blob = await fetch(url.href).then((response) => response.blob());
          replacements.set(raw, await blobToDataUri(blob));
        }
      } catch {
        // Left as written: it did not resolve here, and a data URI we cannot build
        // is no worse than the reference the live page already carries.
      }
    }
  }

  return css.replace(pattern, (whole, _quote: string, raw: string) => {
    const data = replacements.get(raw);
    return data === undefined ? whole : `url("${data}")`;
  });
}

/** Same-origin images become data URIs; remote images keep their URLs, as decided. */
async function inlineImages(scope: Element): Promise<void> {
  for (const img of scope.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src === null || src === '' || /^(?:data:|https?:)/i.test(src)) continue;
    try {
      const url = new URL(src, document.baseURI);
      if (url.origin !== location.origin) continue;
      const blob = await fetch(url.href).then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      });
      img.setAttribute('src', await blobToDataUri(blob));
      img.removeAttribute('srcset');
    } catch {
      // Left as written: the reference was already broken on the live page, or points
      // somewhere we agreed not to inline.
    }
  }
}

/**
 * Favicons, inlined under the same treaty as everything else: data URIs ride along,
 * same-origin files are fetched and turned into one, remote ones stay linked.
 */
async function collectFavicons(): Promise<string> {
  const links: string[] = [];
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    try {
      const url = new URL(link.href, document.baseURI);
      if (url.protocol === 'data:' || url.origin !== location.origin) {
        links.push(link.outerHTML);
        continue;
      }
      const blob = await fetch(url.href).then((response) => response.blob());
      links.push(link.outerHTML.replace(/href="[^"]*"/i, `href="${await blobToDataUri(blob)}"`));
    } catch {
      // One unreachable icon is no reason to skip the export.
    }
  }
  return links.join('\n');
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the asset.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * "On this page" for a file whose only navigation is itself: built from the headings the
 * article already has (remark gave them ids), two levels deep, inserted after the title.
 * Styled by `.seemore-export-toc`, which lives in the site stylesheet the file inlines.
 */
function buildExportToc(article: Element): Element | undefined {
  const headings = Array.from(article.querySelectorAll('h2[id], h3[id]'));
  if (headings.length === 0) return undefined;

  const nav = document.createElement('nav');
  nav.className = 'seemore-export-toc';

  // A collapsible, not a heading pair: on narrow screens the block starts collapsed under
  // the title, and the runtime opens it when the viewport is wide enough for the rail.
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'On this page';
  details.append(summary);

  const top = document.createElement('ul');
  details.append(top);
  nav.append(details);
  let nested: HTMLUListElement | undefined;

  for (const heading of headings) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${heading.id}`;
    a.textContent = heading.textContent ?? '';
    li.append(a);

    if (heading.tagName === 'H2') {
      top.append(li);
      nested = document.createElement('ul');
      li.append(nested);
    } else {
      (nested ?? top).append(li);
    }
  }

  return nav;
}

/** The article is the only thing taken, but dev leaves editor affordances inside it. */
function cleanArticleForExport(article: Element): Element {
  const clone = article.cloneNode(true) as Element;
  for (const el of clone.querySelectorAll('.seemore-editor-layer, .seemore-editor, .seemore-editor-error')) {
    el.remove();
  }
  for (const el of clone.querySelectorAll('[data-seemore-pos]')) {
    el.removeAttribute('data-seemore-pos');
  }
  return clone;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The exported file's runtime: theme toggle, code copy, click-to-zoom — the three behaviors
 * kept, at roughly a kilobyte instead of the site bundle. Handed to React in hydration on
 * the live page; here each is three lines against the static DOM.
 *
 * Kept free of `</script>`-shaped sequences by construction: it is inlined verbatim.
 */
const RUNTIME = `(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('.seemore-export-theme-toggle');
  if (toggle) toggle.addEventListener('click', function () { root.classList.toggle('dark'); });

  document.querySelectorAll('figure').forEach(function (figure) {
    var button = figure.querySelector('button[aria-label]');
    if (!button || !/copy/i.test(button.getAttribute('aria-label') || '')) return;
    button.addEventListener('click', function () {
      var code = figure.querySelector('pre, code');
      if (code && navigator.clipboard) navigator.clipboard.writeText(code.textContent || '');
    });
  });

  // The live site's TOC follows the reader with fumadocs' own scroll tracking; in the file,
  // the plainest version of the same behaviour — last heading above the fold wins.
  var tocLinks = [].slice.call(document.querySelectorAll('.seemore-export-toc a'));
  if (tocLinks.length > 0) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[(a.getAttribute('href') || '').slice(1)] = a; });
    var points = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var sync = function () {
      var current;
      for (var i = 0; i < points.length; i++) {
        // Headings carry scroll-margin-top (room for the live site's fixed header), and an
        // anchor jump parks them exactly there — so "reached" means at or above their own
        // margin line, not the raw viewport top.
        var margin = parseFloat(getComputedStyle(points[i]).scrollMarginTop) || 0;
        if (points[i].getBoundingClientRect().top - margin <= 48) current = points[i]; else break;
      }
      tocLinks.forEach(function (a) { a.removeAttribute('data-active'); });
      if (current) byId[current.id].setAttribute('data-active', 'true');
    };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  // Wide enough for the rail: open the collapsible so it reads as a list, not a disclosure.
  var tocDetails = document.querySelector('.seemore-export-toc details');
  if (tocDetails && window.matchMedia('(min-width: 1280px)').matches) tocDetails.open = true;

  var main = document.querySelector('main');
  var overlay = document.createElement('div');
  overlay.className = 'seemore-export-overlay';
  overlay.hidden = true;
  var zoomed = document.createElement('img');
  overlay.appendChild(zoomed);
  document.body.appendChild(overlay);
  function close() { overlay.hidden = true; zoomed.removeAttribute('src'); }
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
  if (main) main.querySelectorAll('img').forEach(function (img) {
    if (img.closest('a')) return;
    img.addEventListener('click', function () {
      zoomed.setAttribute('src', img.currentSrc || img.src);
      overlay.hidden = false;
    });
  });
})();`;

function buildExportHtml(article: Element, css: string, remoteLinks: string, favicons: string): string {
  const attrs = Array.from(document.documentElement.attributes)
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join('');

  const description = config.description === undefined ? '' : `<meta name="description" content="${escapeHtml(config.description)}">`;

  return [
    '<!doctype html>',
    `<html${attrs}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(document.title)}</title>`,
    description,
    '<meta name="generator" content="seemore">',
    favicons,
    remoteLinks,
    // The guard is belt-and-braces: a stylesheet containing `</style>` would already be
    // breaking the live page's own inline styles the same way.
    `<style>\n${css.replaceAll('</style', '<\\/style')}</style>`,
    '</head>',
    '<body>',
    `<main class="seemore-export-main">${article.outerHTML}</main>`,
    THEME_TOGGLE,
    `<script>${RUNTIME}</script>`,
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** The downloaded file's name: the page's own path segment, sanitised for a filename. */
function exportFilename(): string {
  let path = location.pathname;
  if (config.base !== '/') path = path.replace(config.base, '/');
  const last = decodeURIComponent(path.replace(/\/+$/, '').split('/').at(-1) ?? '');
  const slug = last === '' || last === '/' ? 'index' : last;
  return `${slug.replace(/[^a-zA-Z0-9._-]+/g, '-')}.html`;
}

function download(filename: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Export the page you are reading as one self-contained HTML file. */
export async function exportPageAsHtml(): Promise<void> {
  const article = document.querySelector('main.seemore-main article');
  if (article === null) throw new Error('There is nothing to export on this page.');

  await prepareDiagrams();

  const clone = cleanArticleForExport(article);
  await inlineImages(clone);

  const toc = buildExportToc(clone);
  const heading = clone.querySelector('h1');
  if (toc !== undefined) {
    if (heading !== null && heading.nextElementSibling !== null) {
      heading.nextElementSibling.before(toc);
    } else if (heading !== null) {
      heading.after(toc);
    } else {
      clone.prepend(toc);
    }
  }

  const { css, remoteLinks } = await collectCss();
  const favicons = await collectFavicons();
  download(exportFilename(), buildExportHtml(clone, await inlineCssUrls(css), remoteLinks, favicons));
}

/**
 * Print the page you are reading — the browser's Save-as-PDF makes it a PDF.
 *
 * Print is always light, whatever the screen was showing: code blocks and diagrams are
 * themed by CSS variables that flip with `dark`, and ink follows the light values.
 */
export async function printPageAsPdf(): Promise<void> {
  await prepareDiagrams();

  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  if (!wasDark) {
    window.print();
    return;
  }

  root.classList.remove('dark');
  const restore = () => {
    root.classList.add('dark');
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
  // Safari's dialog does not always fire `afterprint` when it is dismissed; a page left
  // dark-less forever is worse than a late restore.
  window.setTimeout(restore, 60_000);
}
