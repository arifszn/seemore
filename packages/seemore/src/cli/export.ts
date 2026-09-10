import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pc from 'picocolors';
import { build as viteBuild } from 'vite';
import { loadConfig, resolveConfigPath } from '../node/config/load.js';
import { createContext } from '../node/context.js';
import { appRoot, canonicalise, resolveContentRoot } from '../node/paths.js';
import { loadPrerenderModule } from '../node/prerender/render.js';
import { createViteConfig } from '../node/vite/config.js';
import { normaliseBase } from '../shared/base.js';
import { THEME_INIT, THEME_TOGGLE } from '../app/export/themeToggle.js';

export interface ExportOptions {
  cwd: string;
  /** The Markdown file to export, absolute or relative to `cwd`. */
  file: string;
  /** Directory to write the HTML into; default is next to the source file. */
  out?: string;
  configPath?: string;
  base?: string;
}

/**
 * Export one page as a single self-contained HTML file.
 *
 * The browser path (the page-actions button) works against the live DOM; this one has no
 * browser, so it takes the prerender's article-only render and assembles the same file in
 * node: the built stylesheet inlined with its `url()` references embedded, same-origin
 * images embedded, and a runtime inlined that renders diagrams when the file is opened —
 * the one thing node cannot do ahead of time (SPEC §16).
 */
export async function runExport(options: ExportOptions): Promise<void> {
  const target = resolve(options.cwd, options.file);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`No such file: ${options.file}`);
  }

  // The file decides the site: its folder is the content root, exactly as `seemore <dir>`
  // would treat that folder for the whole site.
  const contentRoot = resolveContentRoot(options.cwd, dirname(target));
  const loaded = await loadConfig({ root: contentRoot, configPath: resolveConfigPath(options) });
  const config = {
    ...loaded.config,
    base: options.base === undefined ? loaded.config.base : normaliseBase(options.base),
  };

  if (!config.pageActions.includes('export-html')) {
    throw new Error(`\`pageActions\` in ${loaded.file ?? 'seemore.config.ts'} does not include 'export-html', so this site's pages cannot be exported.`);
  }

  const ctx = createContext({ config, contentRoot });
  const scan = ctx.source.current();
  for (const warning of scan.warnings) ctx.warnings.add(warning);
  const errors = ctx.errors();
  if (errors.length > 0) {
    throw new Error(`seemore found ${errors.length} problem(s) in ${contentRoot}:\n\n${errors.join('\n\n')}`);
  }

  const page = ctx.pages().find((candidate) => candidate.absPath === canonicalise(target));
  if (page === undefined) {
    throw new Error(`${options.file} is not part of this site — excluded in the config, or outside ${relative(options.cwd, contentRoot) || '.'}.`);
  }

  // 1. The client bundle — the export wants the stylesheet it emits, and nothing else.
  const outDir = mkdtempSync(join(tmpdir(), 'seemore-export-'));
  const ssrOutDir = mkdtempSync(join(tmpdir(), 'seemore-export-ssr-'));
  try {
    await viteBuild(createViteConfig({ ctx, mode: 'build', outDir }));
    const css = readBuiltCss(outDir);
    // The template carries the site's default favicon inlined as a data URI — the same
    // artwork the built site ships, so the exported file wants it too.
    const template = readFileSync(join(outDir, 'index.html'), 'utf8');

    // 2. The article, rendered without a shred of layout around it.
    const prerender = await loadPrerenderModule(ctx, ssrOutDir);
    const article = await prerender.renderArticle(page.url);

    // 3. The diagram runtime, bundled from the same components the site itself uses.
    const runtime = await bundleRuntime();

    const html = assemble({ article, css, runtime, config, outDir, contentRoot, template });

    const filename = `${basename(target).replace(/\.(?:md|mdx)$/i, '')}.html`;
    const targetPath =
      options.out === undefined ? join(dirname(target), filename) : join(resolve(options.cwd, options.out), filename);

    if (existsSync(targetPath)) {
      console.log(pc.yellow(`seemore  replacing existing ${relative(options.cwd, targetPath) || targetPath}`));
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, html, 'utf8');

    ctx.warnings.flush();
    console.log(pc.green(`seemore  wrote ${relative(options.cwd, targetPath) || targetPath} (${formatBytes(html.length)})`));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(ssrOutDir, { recursive: true, force: true });
  }
}

/** The one stylesheet the client build emits; a build with none has nothing to style with. */
function readBuiltCss(outDir: string): string {
  const assets = join(outDir, 'assets');
  const files = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith('.css')) : [];
  if (files.length === 0) throw new Error('The build produced no stylesheet — the export would be unstyled.');
  return files.map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
}

/**
 * Bundle `standalone.ts` — diagram rendering plus the kept behaviors — into one IIFE.
 *
 * A plain Vite library build, with no seemore plugins: the entry is deliberately free of
 * everything except the diagram libraries, so it compiles anywhere the package is installed.
 */
async function bundleRuntime(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'seemore-export-runtime-'));
  try {
    await viteBuild({
      configFile: false,
      root: appRoot(),
      build: {
        outDir: dir,
        emptyOutDir: true,
        minify: true,
        target: 'es2018',
        lib: {
          entry: join(appRoot(), 'export', 'standalone.ts'),
          name: 'seemoreExport',
          formats: ['iife'],
          fileName: () => 'runtime.js',
        },
      },
    });
    return readFileSync(join(dir, 'runtime.js'), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assemble(input: {
  article: { html: string; title: string; description?: string };
  css: string;
  runtime: string;
  config: { base: string; title: string; description?: string; favicon?: string };
  outDir: string;
  contentRoot: string;
  template: string;
}): string {
  const { article, css, runtime, config, outDir, contentRoot, template } = input;

  const content = withExportToc(inlineHtmlAssets(article.html, config.base, outDir, contentRoot));
  const title = article.title === '' ? config.title : `${article.title} · ${config.title}`;
  const description = article.description ?? config.description;
  const favicon = faviconLink(config, contentRoot, template);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    description === undefined ? '' : `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta name="generator" content="seemore">',
    THEME_INIT,
    favicon,
    `<style>\n${inlineCssUrls(css, config.base, outDir, contentRoot).replaceAll('</style', '<\\/style')}</style>`,
    '</head>',
    '<body>',
    `<main class="seemore-export-main">`,
    `<article class="seemore-article prose">${content}</article>`,
    '</main>',
    THEME_TOGGLE,
    `<script>${runtime.replaceAll('</script', '<\\/script')}</script>`,
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Same-origin assets in the article become data URIs; remote URLs stay remote. */
function inlineHtmlAssets(html: string, base: string, outDir: string, contentRoot: string): string {
  // `embed` is the PDF viewer (see `Pdf.tsx`); the rest are the elements that carry `src`.
  return html.replace(
    /(<(?:img|embed|iframe|video|audio|source)\b[^>]*\bsrc=")([^"]*)(")/g,
    (whole, open: string, src: string, close: string) => {
      const file = resolveAsset(src, base, outDir, contentRoot);
      if (file === undefined) return whole;
      try {
        return `${open}${dataUriFor(file)}${close}`;
      } catch {
        return whole;
      }
    },
  );
}

function inlineCssUrls(css: string, base: string, outDir: string, contentRoot: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote: string, raw: string) => {
    if (/^(?:data:|https?:)/i.test(raw)) return whole;
    const file = resolveAsset(raw, base, outDir, contentRoot);
    if (file === undefined) return whole;
    try {
      return `url("${dataUriFor(file)}")`;
    } catch {
      return whole;
    }
  });
}

/**
 * Where a site URL lives on disk: build output first (hashed copies of every sibling asset
 * the bundler emitted), then the content root itself (assets referenced without imports).
 */
function resolveAsset(src: string, base: string, outDir: string, contentRoot: string): string | undefined {
  if (src === '' || /^(?:data:|blob:)/i.test(src) || src.startsWith('#')) return undefined;
  let path = src.split('#')[0]?.split('?')[0] ?? '';
  if (base !== '/' && path.startsWith(base)) path = path.slice(base.length - 1);
  const suffix = path.replace(/^\/+/, '');
  for (const root of [outDir, contentRoot]) {
    const candidate = join(root, suffix);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function dataUriFor(file: string): string {
  const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

/**
 * The site's icon, as a `<link>` for the exported head.
 *
 * A configured favicon is a file in the content root, so it is read and inlined — a local
 * `href` would 404 from `file://`. Without one, the template's own inlined default is used.
 */
function faviconLink(config: { favicon?: string }, contentRoot: string, template: string): string {
  if (config.favicon !== undefined) {
    const file = join(contentRoot, config.favicon);
    if (existsSync(file)) {
      try {
        return `<link rel="icon" href="${dataUriFor(file)}" />`;
      } catch {
        // Fall through to the default below.
      }
    }
  }
  const matches = Array.from(template.matchAll(/<link rel="icon"[^>]*>/gi));
  return matches.at(-1)?.[0] ?? '';
}

/**
 * "On this page", read straight off the rendered headings — the same two-level block the
 * browser export builds from the DOM, built here from the HTML because there is no DOM.
 * Exported for the export tests.
 */
export function withExportToc(html: string): string {
  const headings = Array.from(html.matchAll(/<h([23])\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g)).map(
    (match) => ({
      depth: Number(match[1]),
      id: match[2] ?? '',
      text: decodeEntities((match[3] ?? '').replace(/<[^>]+>/g, '')),
    }),
  );
  if (headings.length === 0) return html;

  // Two levels: an h2 opens a section, an h3 nests under the open one. A leading h3 has no
  // section to nest in, so it stands as its own entry rather than being dropped.
  const sections: { id: string; text: string; children: { id: string; text: string }[] }[] = [];
  for (const heading of headings) {
    if (heading.depth === 2 || sections.length === 0) {
      sections.push({ id: heading.id, text: heading.text, children: [] });
    } else {
      sections.at(-1)?.children.push({ id: heading.id, text: heading.text });
    }
  }

  const items = sections
    .map((section) => {
      const self = `<a href="#${section.id}">${escapeHtml(section.text)}</a>`;
      if (section.children.length === 0) return `<li>${self}</li>`;
      const kids = section.children.map((child) => `<li><a href="#${child.id}">${escapeHtml(child.text)}</a></li>`).join('');
      return `<li>${self}<ul>${kids}</ul></li>`;
    })
    .join('');
  const toc = `<nav class="seemore-export-toc"><details><summary>On this page</summary><ul>${items}</ul></details></nav>`;

  const h1 = /<\/h1>/i.exec(html);
  return h1 === null ? toc + html : html.slice(0, h1.index + h1[0].length) + toc + html.slice(h1.index + h1[0].length);
}

function decodeEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} kB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
