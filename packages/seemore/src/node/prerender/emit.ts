import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Turn a route URL into the file that serves it. */
export function outputPathFor(url: string): string {
  const clean = url.replace(/^\/+|\/+$/g, '');
  return clean === '' ? 'index.html' : join(clean, 'index.html');
}

export function writeHtml(outDir: string, relativePath: string, html: string): void {
  const target = join(outDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');
}

/**
 * Inject a rendered page into the client build's `index.html`.
 *
 * The template already carries the hashed script and stylesheet Vite emitted, so the markup
 * and the assets can never drift apart.
 */
export function applyTemplate(template: string, { html, head }: { html: string; head: string }): string {
  // Replacer functions, not strings: a page containing `$&` or `` $` `` would otherwise
  // splice the marker — or the whole document head — into its own body.
  return template.replace('<!--seemore-head-->', () => head).replace('<!--seemore-app-->', () => html);
}
