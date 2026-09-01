import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pc from 'picocolors';
import { build as viteBuild } from 'vite';
import { loadConfig } from '../node/config/load.js';
import { createContext, type OpenmdContext } from '../node/context.js';
import { normaliseBase } from '../shared/base.js';
import { resolveContentRoot } from '../node/paths.js';
import { applyTemplate, outputPathFor, writeHtml } from '../node/prerender/emit.js';
import { writeDeployArtifacts } from '../node/prerender/deploy.js';
import { loadPrerenderModule } from '../node/prerender/render.js';
import { buildSearchIndex, formatBytes, measureIndex } from '../node/search/build.js';
import { generateSocialCards } from '../node/social/cards.js';
import { createViteConfig } from '../node/vite/config.js';

export interface BuildOptions {
  cwd: string;
  dir?: string;
  configPath?: string;
  outDir?: string;
  base?: string;
}

export async function runBuild(options: BuildOptions): Promise<{ outDir: string; routes: number }> {
  const contentRoot = resolveContentRoot(options.cwd, options.dir);
  const loaded = await loadConfig({ root: options.cwd, configPath: options.configPath });

  const config = { ...loaded.config, base: options.base === undefined ? loaded.config.base : normaliseBase(options.base) };
  warnAboutMissingBase(config.base, loaded.file);

  const ctx = createContext({ config, contentRoot });
  const outDir = resolve(options.cwd, options.outDir ?? 'dist');
  assertSafeOutDir(outDir, options.cwd, contentRoot);

  const scan = ctx.source.current();
  failOnErrors(ctx.errors(), contentRoot);
  if (scan.pages.length === 0) {
    throw new Error(`No Markdown files found under ${contentRoot}. Point openmd at a folder that has some, or check \`exclude\`.`);
  }
  for (const warning of scan.warnings) ctx.warnings.add(warning);

  console.log(pc.dim(`openmd  ${scan.pages.length} pages from ${relative(options.cwd, contentRoot) || '.'}`));

  // 1. The client bundle, which also produces the HTML template every page is injected into.
  await viteBuild(createViteConfig({ ctx, mode: 'build', outDir }));
  const template = readFileSync(join(outDir, 'index.html'), 'utf8');

  // 2. The same module graph, evaluated in node.
  const ssrOutDir = mkdtempSync(join(tmpdir(), 'openmd-ssr-'));
  try {
    const prerender = await loadPrerenderModule(ctx, ssrOutDir);
    const urls = prerender.listRoutes();

    for (const url of urls) {
      writeHtml(outDir, outputPathFor(url), applyTemplate(template, await prerender.render(url)));
    }

    // 3. The shell an unknown address falls back to, which is also Surge's `200.html`.
    const notFound = applyTemplate(template, await prerender.render('/__openmd_not_found'));
    writeHtml(outDir, '404.html', notFound);
    writeDeployArtifacts(outDir, config.base, notFound);

    // 4. The search index, at the same path the dev middleware serves.
    if (config.search.provider === 'static') {
      const index = await buildSearchIndex(ctx);
      mkdirSync(join(outDir, 'api'), { recursive: true });
      writeFileSync(join(outDir, 'api', 'search.json'), index, 'utf8');

      const size = measureIndex(index);
      console.log(pc.dim(`openmd  search index ${formatBytes(size.gzipped)} gzipped`));
      if (size.warning !== undefined) ctx.warnings.add(size.warning);
    }

    if (config.search.provider !== 'static') await warnIfSearchSdkMissing(ctx, config.search.provider);

    if (config.features['social.cards']) await generateSocialCards(ctx, outDir);

    ctx.warnings.flush();
    console.log(pc.green(`openmd  ${urls.length} pages written to ${relative(options.cwd, outDir) || outDir}`));

    return { outDir, routes: urls.length };
  } finally {
    rmSync(ssrOutDir, { recursive: true, force: true });
  }
}

/**
 * The build empties `outDir` before writing, and `outDir` is always outside the Vite root —
 * openmd's root is its own package — so Vite's own guard against that never fires. A typo
 * like `--out .` would delete the project, so it is refused here instead.
 */
function assertSafeOutDir(outDir: string, cwd: string, contentRoot: string): void {
  const contains = (parent: string, child: string): boolean => {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };

  for (const [name, dir] of [
    ['the current directory', cwd],
    ['the content directory', contentRoot],
  ] as const) {
    if (contains(outDir, dir)) {
      throw new Error(
        `Refusing to build into ${outDir}: it is, or contains, ${name}, and the build empties its output directory first. Pass --out with a directory of its own.`,
      );
    }
  }
}

/**
 * The hosted search providers need an SDK that openmd does not depend on. Finding out in the
 * browser means an empty search box; finding out here means a line in the build log.
 */
async function warnIfSearchSdkMissing(ctx: OpenmdContext, provider: 'algolia' | 'orama-cloud'): Promise<void> {
  const packageName = provider === 'algolia' ? 'algoliasearch' : '@orama/core';
  try {
    createRequire(join(ctx.config.root, 'noop.js')).resolve(packageName);
  } catch {
    ctx.warnings.add(
      `\`search.provider\` is '${provider}', which needs ${packageName}. Run \`npm install ${packageName}\` or search will find nothing.`,
    );
  }
}

/** Failing conditions produce a silently wrong site; warnings produce a visibly wrong page. */
function failOnErrors(errors: string[], contentRoot: string): void {
  if (errors.length === 0) return;
  throw new Error(`openmd found ${errors.length} problem(s) in ${contentRoot}:\n\n${errors.join('\n\n')}`);
}

/**
 * `base` is never inferred. Under CI, where getting it wrong ships a broken site,
 * say so — with the exact line to add.
 */
function warnAboutMissingBase(base: string, configFile: string | undefined): void {
  if (base !== '/' || process.env.GITHUB_ACTIONS !== 'true') return;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  console.warn(
    pc.yellow(
      `openmd  \`base\` is not set, and GitHub Pages serves project sites from a subpath.\n` +
        `        Add this to ${configFile ?? 'openmd.config.ts'}:\n\n` +
        `          base: '/${repo ?? 'your-repo'}/',\n\n` +
        `        Or pass --base '/${repo ?? 'your-repo'}/'. Ignore this if you deploy to a domain root.`,
    ),
  );
}
