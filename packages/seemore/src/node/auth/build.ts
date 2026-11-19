import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createManifest } from '../../shared/auth/crypto.js';
import { APP_FILE, MANIFEST_FILE, WORKER_FILE } from '../../shared/auth/files.js';
import type { ResolvedSeemoreConfig } from '../config/schema.js';
import type { SeemoreContext } from '../context.js';
import { resolveFavicon } from '../favicon.js';
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
  writeHtml(outDir, APP_FILE, applyTemplate(template, { html: '', head: appHead(config) }));

  const shell = renderLockShell({
    title: config.title,
    description: config.description,
    base: config.base,
    favicon: faviconHref(template),
    colours: shellColours(config.theme),
    script: await bundleAuthScript('lock'),
  });
  writeHtml(outDir, 'index.html', shell);
  writeHtml(outDir, '404.html', shell);
  writeDeployArtifacts(outDir, config.base, shell, { auth: true });

  const { manifest, contentKey } = await createManifest({ password, id: auth.id, remember: auth.remember });
  writeFileSync(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const open = publicFiles(resolveFavicon(config)?.path);
  writeFileSync(
    join(outDir, WORKER_FILE),
    `var SEEMORE_AUTH=${JSON.stringify({ publicFiles: open })};\n${await bundleAuthScript('sw')}`,
    'utf8',
  );

  const encrypted = await encryptOutput(outDir, contentKey, open);
  assertOutputEncrypted(outDir, open);
  return encrypted;
}

/** The template's one icon: the configured favicon, else seemore's own mark. */
export function faviconHref(template: string): string | undefined {
  const href = /<link rel="icon" href="([^"]+)"/.exec(template)?.[1];
  return href === undefined ? undefined : unescapeAttribute(href);
}

function unescapeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function appHead(config: ResolvedSeemoreConfig): string {
  const tags = [`<title>${escapeHtml(config.title)}</title>`, '<meta name="robots" content="noindex, nofollow" />'];
  if (config.description !== undefined) {
    tags.push(`<meta name="description" content="${escapeHtml(config.description)}" />`);
  }
  return tags.join('\n    ');
}
