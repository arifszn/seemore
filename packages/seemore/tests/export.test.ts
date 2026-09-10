import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runExport, withExportToc } from '../src/cli/export.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'site');

describe('seemore export', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'seemore-export-'));
    // The diagrams page and the assets page between them cover both exports' content kinds.
    await runExport({ cwd: FIXTURE, file: 'getting-started.md', out: outDir });
    await runExport({ cwd: FIXTURE, file: 'README.md', out: outDir });
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('writes one HTML file per exported page', () => {
    expect(existsSync(join(outDir, 'getting-started.html'))).toBe(true);
    expect(existsSync(join(outDir, 'README.html'))).toBe(true);
  });

  it('writes a document with the page title and no site chrome', () => {
    const $ = load(readFileSync(join(outDir, 'getting-started.html'), 'utf8'));

    expect($('title').text()).toBe('Getting started · Docs');
    // Only the article is taken: none of the shell survives, not even as empty elements.
    expect($('article.seemore-article.prose').length).toBe(1);
    expect($('header').length).toBe(0);
    expect($('aside').length).toBe(0);
    expect($('nav.seemore-sidebar').length).toBe(0);
    expect($('footer').length).toBe(0);
    expect($('.seemore-page-actions').length).toBe(0);
  });

  it('inlines the stylesheet and the favicon, and ships no external references', () => {
    const $ = load(readFileSync(join(outDir, 'getting-started.html'), 'utf8'));

    expect($('style').length).toBeGreaterThan(0);
    expect($('link[rel="stylesheet"]').length).toBe(0);
    expect($('link[rel="icon"][href^="data:"]').length).toBe(1);
    expect($('script[type="module"]').length).toBe(0);
    expect($('script').last().text()).toContain('seemore-export');
  });

  it('keeps diagrams as renderable sources the inlined runtime can render', () => {
    const $ = load(readFileSync(join(outDir, 'getting-started.html'), 'utf8'));

    expect($('.seemore-mermaid .seemore-mermaid-source').length).toBe(1);
    expect($('.seemore-d2 .seemore-d2-source').length).toBe(1);
  });

  it('inlines same-origin images and embedded PDFs as data URIs', () => {
    const $ = load(readFileSync(join(outDir, 'README.html'), 'utf8'));

    expect($('img[src^="data:image"]').length).toBe(1);
    expect($('embed[src^="data:application/pdf"]').length).toBe(1);
  });

  it('ships the print stylesheet the PDF path depends on', () => {
    const html = readFileSync(join(outDir, 'getting-started.html'), 'utf8');
    const css = load(html)('style').text();

    expect(css).toContain('@media print');
    expect(css).toContain('.seemore-export-toc');
    // Print hides the page-actions button itself — chrome never prints.
    expect(css).toMatch(/\.seemore-page-actions[^}]*display:\s*none/s);
  });

  it('refuses a file that is excluded from the site', async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-export-refuse-'));
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');
    writeFileSync(join(contentRoot, 'secret.md'), '# Not listed\n');
    writeFileSync(
      join(contentRoot, 'seemore.config.ts'),
      "export default { title: 'Refuser', exclude: ['secret.md'] };",
    );

    await expect(
      runExport({ cwd: contentRoot, file: 'secret.md', out: join(contentRoot, 'out') }),
    ).rejects.toThrow(/not part of this site/);

    rmSync(contentRoot, { recursive: true, force: true });
  });

  it("refuses when the config's pageActions leave out export-html", async () => {
    const contentRoot = mkdtempSync(join(tmpdir(), 'seemore-export-disabled-'));
    writeFileSync(join(contentRoot, 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');
    writeFileSync(join(contentRoot, 'seemore.config.ts'), "export default { title: 'No Exports', pageActions: [] };");

    await expect(runExport({ cwd: contentRoot, file: 'index.md', out: join(contentRoot, 'out') })).rejects.toThrow(
      /export-html/,
    );

    rmSync(contentRoot, { recursive: true, force: true });
  });
});

describe('the export toc', () => {
  it('builds a two-level collapsible toc and places it after the h1', () => {
    const html = withExportToc(
      '<h1>Title</h1><p>intro</p><h2 id="a">First</h2><h3 id="b">Nested</h3><h2 id="c">Second</h2>',
    );

    const h1End = html.indexOf('</h1>') + '</h1>'.length;
    const nav = html.slice(h1End);
    expect(nav.startsWith('<nav class="seemore-export-toc"><details><summary>On this page</summary><ul>')).toBe(true);
    expect(nav).toContain('<a href="#a">First</a><ul><li><a href="#b">Nested</a></li></ul>');
    // A leaf h2 gets no nested list, and the content resumes right after the toc.
    expect(nav).toContain('<li><a href="#c">Second</a></li>');
    expect(nav).toContain('</ul></details></nav><p>intro</p>');
  });

  it('decodes entities in heading text', () => {
    const html = withExportToc('<h1>T</h1><h2 id="x">A &amp; B</h2>');
    expect(html).toContain('<a href="#x">A &amp; B</a>');
  });

  it('leaves a page without headed sections alone', () => {
    const html = '<h1>Title</h1><p>no sections</p>';
    expect(withExportToc(html)).toBe(html);
  });
});
