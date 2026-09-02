import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runBuild } from '../src/cli/build.js';
import { applyTemplate } from '../src/node/prerender/emit.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'site');

function read(outDir: string, relative: string): string {
  return readFileSync(join(outDir, relative), 'utf8');
}

/** Every href/src an emitted page contains, ignoring hashes and external URLs. */
function localUrls(html: string): string[] {
  const $ = load(html);
  const urls: string[] = [];
  $('[href], [src]').each((_, element) => {
    for (const attribute of ['href', 'src']) {
      const value = $(element).attr(attribute);
      if (value === undefined || value === '' || value.startsWith('#')) continue;
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) continue;
      urls.push(value);
    }
  });
  return urls;
}

describe('seemore build', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'seemore-build-'));
    await runBuild({ cwd: FIXTURE, outDir });
  }, 300_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('emits one directory-style HTML file per route', () => {
    for (const file of [
      'index.html',
      'getting-started/index.html',
      'guide/index.html',
      'guide/deep-dive/index.html',
      'guide/nested/page/index.html',
      'reference/page/index.html',
      'guía/página-uno/index.html',
      '404.html',
      '200.html',
      '_redirects',
      '.nojekyll',
      'api/search.json',
    ]) {
      expect(existsSync(join(outDir, file)), `missing ${file}`).toBe(true);
    }
  });

  /**
   * The acceptance test. Reading the bytes proves more than a headless browser
   * with JS disabled, and proves it faster.
   */
  it('prerenders a deep route with its full page text in the HTML', () => {
    const $ = load(read(outDir, 'guide/nested/page/index.html'));
    const text = $('article').text();
    expect(text).toContain('NESTED SENTINEL TEXT');
    expect(text).toContain('A page two directories down');
    expect($('h1').text()).toContain('Nested page');
  });

  it('prerenders the root README as the home page', () => {
    const text = load(read(outDir, 'index.html'))('article').text();
    expect(text).toContain('THE FULL PAGE TEXT IS PRESENT');
  });

  it('prerenders a unicode route', () => {
    const text = load(read(outDir, 'guía/página-uno/index.html'))('article').text();
    expect(text).toContain('UNICODE SENTINEL TEXT');
  });

  it('renders the sidebar into every page, so navigation works before hydration', () => {
    const $ = load(read(outDir, 'guide/deep-dive/index.html'));
    const hrefs = $('aside a').map((_, a) => $(a).attr('href')).get();
    expect(hrefs).toContain('/getting-started');
    expect(hrefs).toContain('/guide/deep-dive');
  });

  it('renders GFM tables', () => {
    expect(load(read(outDir, 'guide/deep-dive/index.html'))('article table').length).toBe(1);
  });

  it("renders GitHub's alert syntax as a callout, not a blockquote", () => {
    // `> [!NOTE]` is what repositories actually contain; fumadocs ships `:::note`.
    const $ = load(read(outDir, 'guide/deep-dive/index.html'));
    expect($('article').text()).not.toContain('[!NOTE]');
    expect($('article').text()).toContain('An admonition');
    expect($('article blockquote').length).toBe(0);
  });

  it('highlights code at build time, shipping no highlighter to the browser', () => {
    const $ = load(read(outDir, 'getting-started/index.html'));
    const code = $('article pre code');
    expect(code.length).toBeGreaterThan(0);
    // Shiki emits per-token spans with inline colours; an unhighlighted block has none.
    expect(code.find('span[style]').length).toBeGreaterThan(0);
    expect(code.text()).toContain('defineConfig');
  });

  it('resolves relative markdown links to routes', () => {
    const $ = load(read(outDir, 'guide/index.html'));
    const hrefs = $('article a').map((_, a) => $(a).attr('href')).get();
    expect(hrefs).toContain('/');
  });

  it('resolves wikilinks, and renders a dead one as plain text', () => {
    const $ = load(read(outDir, 'index.html'));
    const hrefs = $('article a').map((_, a) => $(a).attr('href')).get();
    expect(hrefs).toContain('/guide/deep-dive');
    // Ambiguous `[[page]]` resolves to the shallowest match, deterministically.
    expect(hrefs).toContain('/reference/page');
    expect(hrefs).not.toContain(undefined);
    expect($('.seemore-broken-wikilink').text()).toContain('No Such Page');
  });

  it('produces a search index containing every page', () => {
    const index = read(outDir, 'api/search.json');
    for (const url of ['/guide/deep-dive', '/getting-started', '/reference/page']) {
      expect(index).toContain(url);
    }
  });

  it('writes the fallback conventions each host looks for', () => {
    // Netlify and Cloudflare Pages.
    expect(read(outDir, '_redirects')).toContain('/*');
    // Surge.
    expect(read(outDir, '200.html')).toContain('<div id="root">');
  });

  it('keeps GitHub Pages from running the output through Jekyll', () => {
    // Jekyll drops every path beginning with `_`, so without this file a page that builds
    // correctly 404s once deployed.
    expect(existsSync(join(outDir, '.nojekyll'))).toBe(true);
    expect(existsSync(join(outDir, '_internal', 'notes', 'index.html'))).toBe(true);
    expect(load(read(outDir, '_internal/notes/index.html'))('article').text()).toContain(
      'UNDERSCORE SENTINEL TEXT',
    );
  });

  it('inlines a sibling image as a hashed asset', () => {
    const src = load(read(outDir, 'index.html'))('article img').attr('src');
    expect(src).toBeDefined();
    expect(src).toMatch(/^\/assets\/diagram-[\w-]+\.svg$/);
  });

  it('renders a sibling PDF in the browser viewer', () => {
    const $ = load(read(outDir, 'index.html'));
    const embed = $('article embed[type="application/pdf"]');
    expect(embed.length).toBe(1);
    expect(embed.attr('src')).toMatch(/^\/assets\/spec-[\w-]+\.pdf$/);
  });

  it('emits hashed assets rather than referencing source paths', () => {
    const assets = readdirSync(join(outDir, 'assets'));
    expect(assets.some((file) => file.endsWith('.js'))).toBe(true);
    expect(assets.some((file) => file.endsWith('.css'))).toBe(true);
  });
});

describe('the generated index page', () => {
  it('lists every page at / when no index or README claims it', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-toc-'));
    const outDir = join(contentRoot, 'dist');
    writeFileSync(join(contentRoot, 'beta.md'), '---\ntitle: Beta\ndescription: The beta docs.\n---\n\n# Beta\n');
    writeFileSync(join(contentRoot, 'alpha.md'), '---\ntitle: Alpha\n---\n\n# Alpha\n');
    mkdirSync(join(contentRoot, 'guide'));
    writeFileSync(join(contentRoot, 'guide/index.md'), '---\ntitle: Guide overview\n---\n\n# Guide\n');
    writeFileSync(join(contentRoot, 'guide/deep.md'), '---\ntitle: Deep\n---\n\n# Deep\n');

    const result = await runBuild({ cwd: contentRoot, outDir });

    const $ = load(readFileSync(join(outDir, 'index.html'), 'utf8'));
    // The full shell, sidebar included — the generated page is laid out like any other.
    expect($('aside.seemore-sidebar').length).toBe(1);
    expect($('.seemore-overview-card').length).toBe(4);
    const hrefs = $('article a').map((_, a) => $(a).attr('href')).get();
    // Every page is listed, in the order the sidebar shows.
    expect(hrefs).toEqual(['/alpha', '/beta', '/guide', '/guide/deep']);
    expect($('article').text()).toContain('The beta docs.');
    expect($('article').text()).not.toContain('Page not found');
    // The generated page is counted with the rest.
    expect(result.routes).toBe(5);

    rmSync(contentRoot, { recursive: true, force: true });
  }, 300_000);
});

/** `/sub` and `/sub/...` are both under the base; anything else at the root is a leak. */
function isBased(url: string): boolean {
  if (!url.startsWith('/')) return true;
  return url === '/sub' || url.startsWith('/sub/');
}

describe('base path handling', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'seemore-base-'));
    await runBuild({ cwd: FIXTURE, outDir, base: '/sub/' });
  }, 300_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('leaks no absolute-root URLs into any emitted page', () => {
    const pages = ['index.html', 'guide/index.html', 'guide/nested/page/index.html', '404.html'];
    for (const page of pages) {
      for (const url of localUrls(read(outDir, page))) {
        expect(isBased(url), `${page} leaks ${url}`).toBe(true);
      }
    }
  });

  it('prefixes every internal link with the base', () => {
    const $ = load(read(outDir, 'guide/index.html'));
    const hrefs = $('a[href^="/"]').map((_, a) => $(a).attr('href')).get();
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(isBased(href), `unbased link ${href}`).toBe(true);
  });

  it('points the search index fetch at the based URL', () => {
    // The fetch URL lives in the bundle, not in the markup: the client reads it from
    // `virtual:seemore/config`.
    const bundle = readdirSync(join(outDir, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => read(outDir, join('assets', file)))
      .join('');
    expect(bundle).toContain('/sub/api/search.json');
  });

  it('bases the host fallbacks too', () => {
    expect(read(outDir, '_redirects')).toContain('/sub/*');
  });

  it('still prerenders the full page text', () => {
    expect(load(read(outDir, 'guide/nested/page/index.html'))('article').text()).toContain('NESTED SENTINEL TEXT');
  });
});

describe('failure policy', () => {
  it('fails the build on a duplicate slug, listing every colliding file', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-dupe-'));
    writeFileSync(join(contentRoot, 'Deep Dive.md'), '---\ntitle: One\n---\n');
    writeFileSync(join(contentRoot, 'deep-dive.md'), '---\ntitle: Two\n---\n');

    await expect(runBuild({ cwd: contentRoot, outDir: join(contentRoot, 'dist') })).rejects.toThrow(
      /Deep Dive\.md[\s\S]*deep-dive\.md/,
    );
    rmSync(contentRoot, { recursive: true, force: true });
  });

  it('fails the build on invalid frontmatter, naming the file and the field', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-frontmatter-'));
    writeFileSync(join(contentRoot, 'bad.md'), '---\ntitle: 42\norder: soon\n---\n');

    await expect(runBuild({ cwd: contentRoot, outDir: join(contentRoot, 'dist') })).rejects.toThrow(
      /bad\.md[\s\S]*order/,
    );
    rmSync(contentRoot, { recursive: true, force: true });
  });

  it('fails the build when the content root holds no Markdown at all', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-empty-'));
    await expect(runBuild({ cwd: contentRoot, outDir: join(contentRoot, 'dist') })).rejects.toThrow(
      /No Markdown files found/,
    );
    rmSync(contentRoot, { recursive: true, force: true });
  });

  it('only warns about a missing image, because the page is visibly wrong on its own', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-image-'));
    const outDir = join(contentRoot, 'dist');
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n\n![gone](./nope.png)\n');

    await expect(runBuild({ cwd: contentRoot, outDir })).resolves.toMatchObject({ routes: 1 });
    expect(load(readFileSync(join(outDir, 'index.html'), 'utf8'))('article').text()).toContain('Home');
    rmSync(contentRoot, { recursive: true, force: true });
  });

  it('renders a fence in a language Shiki has no grammar for as plain code', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-lang-'));
    const outDir = join(contentRoot, 'dist');
    writeFileSync(
      join(contentRoot, 'index.md'),
      '---\ntitle: Home\n---\n\n# Home\n\n```made-up-lang\nx -> y: depends\n```\n',
    );

    // Without the fallback this throws `Language 'made-up-lang' not found` and the page never renders.
    await expect(runBuild({ cwd: contentRoot, outDir })).resolves.toMatchObject({ routes: 1 });
    expect(load(readFileSync(join(outDir, 'index.html'), 'utf8'))('article pre code').text()).toContain(
      'x -> y: depends',
    );
    rmSync(contentRoot, { recursive: true, force: true });
  });
});

describe('applyTemplate', () => {
  it('treats page content as text, not as a replacement pattern', () => {
    const template = '<html><head><!--seemore-head--></head><body><!--seemore-app--></body></html>';
    // `$&`, `` $` `` and `$1` are substitution patterns to `String.replace`.
    const html = "<p>Use $& in sed, $` for the prefix, and $1 for a group.</p>";

    const out = applyTemplate(template, { html, head: '<title>$&</title>' });

    expect(out).toContain(html);
    expect(out).toContain('<title>$&</title>');
    expect(out).not.toContain('seemore-app');
  });
});

describe('the GitHub Pages base warning', () => {
  const previous = { ...process.env };

  afterAll(() => {
    process.env = previous;
  });

  it('names the exact config line to add, and never guesses the base itself', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-ghpages-'));
    const outDir = join(contentRoot, 'dist');
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');

    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_REPOSITORY = 'someone/my-repo';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let printed = '';
    try {
      await runBuild({ cwd: contentRoot, outDir });
    } finally {
      // Read the calls before restoring: `mockRestore` clears them.
      printed = warn.mock.calls.map((call) => String(call[0])).join('\n');
      warn.mockRestore();
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITHUB_REPOSITORY;
    }

    expect(printed).toContain("base: '/my-repo/'");

    // Warned about, never applied: the site still builds at the root.
    const src = load(readFileSync(join(outDir, 'index.html'), 'utf8'))('script[src]').attr('src');
    expect(src?.startsWith('/assets/')).toBe(true);

    rmSync(contentRoot, { recursive: true, force: true });
  });
});

describe('output directory safety', () => {
  it('refuses to build into a directory that contains the project', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-outdir-'));
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');

    // `--out .` would empty the very directory being documented.
    await expect(runBuild({ cwd: contentRoot, outDir: '.' })).rejects.toThrow(/Refusing to build into/);
    await expect(runBuild({ cwd: contentRoot, outDir: '..' })).rejects.toThrow(/Refusing to build into/);

    expect(existsSync(join(contentRoot, 'index.md'))).toBe(true);
    rmSync(contentRoot, { recursive: true, force: true });
  });
});

describe('stylesheet composition', () => {
  it('keeps the fumadocs preset and puts the user stylesheet last', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-css-'));
    const outDir = join(contentRoot, 'out');
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');
    writeFileSync(join(contentRoot, 'custom.css'), '.seemore-article { --seemore-user-marker: 1; }\n');
    writeFileSync(
      join(contentRoot, 'seemore.config.ts'),
      "export default { title: 'Themed', theme: 'ocean', css: './custom.css' };",
    );

    await runBuild({ cwd: contentRoot, outDir });

    const css = readdirSync(join(outDir, 'assets'))
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(join(outDir, 'assets', file), 'utf8'))
      .join('');

    // Inlining user CSS above the `@import` chain would silently drop the whole preset.
    expect(css).toContain('--color-fd-background');
    expect(css).toContain('--seemore-user-marker');
    // And it has to land after our own rules, or it cannot override them.
    expect(css.indexOf('--seemore-user-marker')).toBeGreaterThan(css.indexOf('.seemore-header'));

    rmSync(contentRoot, { recursive: true, force: true });
  });
});
