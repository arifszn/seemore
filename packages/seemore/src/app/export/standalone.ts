/**
 * The runtime inside a CLI-exported page.
 *
 * `seemore export` renders the article in node, where diagrams cannot render — that would
 * mean a headless browser as an install dependency, which SPEC §16 rules out. This entry,
 * bundled to an IIFE and inlined into the file, finishes the job when the page is opened:
 * each diagram is rendered from the source `pre` the site's own components leave in
 * prerendered output. It also binds the behaviors the export keeps — theme toggle, code
 * copy, click-to-zoom — so the file behaves like the browser-exported one.
 *
 * The browser export ships a hand-written twin of the behavior half (the `RUNTIME` string
 * in `exportPage.ts`): it needs no diagram half, because its diagrams are already SVG when
 * the export runs. Keep the two in sync.
 */

const isDark = (): boolean => document.documentElement.classList.contains('dark');

async function renderMermaid(container: HTMLElement, chart: string, index: number): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' });
  const { svg } = await mermaid.render(`seemore-export-mermaid-${index}`, chart);
  container.innerHTML = svg;
}

async function renderD2(container: HTMLElement, chart: string, index: number): Promise<void> {
  const { D2: D2Compiler } = await import('@terrastruct/d2');
  const compiler = new D2Compiler();
  const { diagram, renderOptions } = await compiler.compile(chart, {
    options: { themeID: isDark() ? 300 : 0 },
  });
  container.innerHTML = await compiler.render(diagram, { ...renderOptions, salt: String(index) });
}

/** The site's own failure UI for a diagram that will not render. */
function fail(container: HTMLElement, className: string, cause: unknown): void {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.setAttribute('role', 'note');
  pre.textContent = `Could not render this diagram: ${cause instanceof Error ? cause.message : String(cause)}`;
  container.replaceChildren(pre);
}

async function renderDiagrams(): Promise<void> {
  const kinds = [
    { selector: '.seemore-mermaid', source: '.seemore-mermaid-source', error: 'seemore-mermaid-error', render: renderMermaid },
    { selector: '.seemore-d2', source: '.seemore-d2-source', error: 'seemore-d2-error', render: renderD2 },
  ] as const;

  for (const kind of kinds) {
    const containers = Array.from(document.querySelectorAll<HTMLElement>(kind.selector));
    for (const [index, container] of containers.entries()) {
      if (container.querySelector('svg') !== null) continue;
      const chart = container.querySelector(kind.source)?.textContent ?? '';
      if (chart === '') continue;
      try {
        await kind.render(container, chart, index);
      } catch (cause) {
        fail(container, kind.error, cause);
      }
    }
  }
}

function bindBehaviors(): void {
  const root = document.documentElement;
  document.querySelector('.seemore-export-theme-toggle')?.addEventListener('click', () => {
    root.classList.toggle('dark');
  });

  for (const figure of document.querySelectorAll('figure')) {
    const button = figure.querySelector('button[aria-label]');
    if (button === null || !/copy/i.test(button.getAttribute('aria-label') ?? '')) continue;
    button.addEventListener('click', () => {
      const code = figure.querySelector('pre, code');
      if (code !== null) void navigator.clipboard?.writeText(code.textContent ?? '');
    });
  }

  // The live site's TOC follows the reader with fumadocs' own scroll tracking; in the file,
  // the plainest version of the same behaviour — last heading above the fold wins.
  const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.seemore-export-toc a'));
  if (tocLinks.length > 0) {
    const byId = new Map<string, HTMLAnchorElement>();
    for (const a of tocLinks) byId.set((a.getAttribute('href') ?? '').slice(1), a);
    const points = Array.from(byId.keys())
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const sync = (): void => {
      let current: HTMLElement | undefined;
      for (const point of points) {
        // Headings carry `scroll-margin-top` (room for the live site's fixed header), and an
        // anchor jump parks them exactly there — so "reached" means at or above their own
        // margin line, not the raw viewport top.
        const margin = Number.parseFloat(getComputedStyle(point).scrollMarginTop) || 0;
        if (point.getBoundingClientRect().top - margin <= 48) current = point;
        else break;
      }
      for (const a of tocLinks) a.removeAttribute('data-active');
      if (current !== undefined) byId.get(current.id)?.setAttribute('data-active', 'true');
    };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  // Wide enough for the rail: open the collapsible so it reads as a list, not a disclosure.
  const tocDetails = document.querySelector<HTMLDetailsElement>('.seemore-export-toc details');
  if (tocDetails && window.matchMedia('(min-width: 1400px)').matches) tocDetails.open = true;

  const overlay = document.createElement('div');
  overlay.className = 'seemore-export-overlay';
  overlay.hidden = true;
  const zoomed = document.createElement('img');
  overlay.append(zoomed);
  document.body.append(overlay);
  const close = (): void => {
    overlay.hidden = true;
    zoomed.removeAttribute('src');
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  for (const img of document.querySelectorAll<HTMLImageElement>('main img')) {
    if (img.closest('a') !== null) continue;
    img.addEventListener('click', () => {
      zoomed.setAttribute('src', img.currentSrc || img.src);
      overlay.hidden = false;
    });
  }
}

function main(): void {
  bindBehaviors();
  void renderDiagrams();
}

main();
