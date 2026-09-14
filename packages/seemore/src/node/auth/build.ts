import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createManifest } from '../../shared/auth/crypto.js';
import { APP_FILE, MANIFEST_FILE, WORKER_FILE } from '../../shared/auth/files.js';
import { withBase } from '../base.js';
import type { ResolvedSeemoreConfig } from '../config/schema.js';
import { toPosix } from '../content/slug.js';
import type { SeemoreContext } from '../context.js';
import { writeDeployArtifacts } from '../prerender/deploy.js';
import { applyTemplate, writeHtml } from '../prerender/emit.js';
import { bundleAuthScript } from './bundle.js';
import { assertOutputEncrypted, encryptOutput, publicFiles } from './output.js';
import { escapeHtml, renderLockShell } from './shell.js';
import { shellColours } from './theme.js';

/**
 * Turn a written client build into a password-protected one, after everything else is in
 * `outDir`: the app template becomes `app.html`, every public entry point becomes the lock
 * shell, and every other file is encrypted in place — then checked, so nothing that escaped
 * encryption can ship.
 *
 * Returns the number of files encrypted.
 */
export async function sealSite(ctx: SeemoreContext, outDir: string, template: string, password: string): Promise<number> {
  const { config } = ctx;
  const auth = config.auth;
  if (auth === undefined) throw new Error('seemore: sealSite needs `auth` in the config.');

  // The app's HTML, served by the worker for every navigation. No prerendered body — the
  // client entry renders into an empty root — and a head with nothing page-specific in it.
  writeHtml(outDir, APP_FILE, applyTemplate(template, { html: '', head: appHead(config, template) }));

  const shell = renderLockShell({
    title: config.title,
    description: config.description,
    base: config.base,
    favicon: faviconHref(config, template),
    colours: shellColours(config.theme),
    script: await bundleAuthScript('lock'),
  });
  writeHtml(outDir, 'index.html', shell);
  writeHtml(outDir, '404.html', shell);
  writeDeployArtifacts(outDir, config.base, shell, { auth: true });

  const { manifest, contentKey } = await createManifest({ password, id: auth.id, remember: auth.remember });
  writeFileSync(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const open = publicFiles(config.favicon);
  writeFileSync(
    join(outDir, WORKER_FILE),
    `var SEEMORE_AUTH=${JSON.stringify({ publicFiles: open })};\n${await bundleAuthScript('sw')}`,
    'utf8',
  );

  const encrypted = await encryptOutput(outDir, contentKey, open);
  assertOutputEncrypted(outDir, open);
  return encrypted;
}

/** The configured favicon, else seemore's own mark, which the app template inlines. */
export function faviconHref(config: ResolvedSeemoreConfig, template: string): string | undefined {
  if (config.favicon !== undefined) return withBase(config.base, `/${toPosix(config.favicon)}`);
  return /<link rel="icon" href="(data:[^"]+)"/.exec(template)?.[1];
}

function appHead(config: ResolvedSeemoreConfig, template: string): string {
  const tags = [`<title>${escapeHtml(config.title)}</title>`, '<meta name="robots" content="noindex, nofollow" />'];
  if (config.description !== undefined) {
    tags.push(`<meta name="description" content="${escapeHtml(config.description)}" />`);
  }
  // The template already carries seemore's default mark; only a configured one is added.
  const favicon = faviconHref(config, template);
  if (config.favicon !== undefined && favicon !== undefined) tags.push(`<link rel="icon" href="${escapeHtml(favicon)}" />`);
  return tags.join('\n    ');
}
