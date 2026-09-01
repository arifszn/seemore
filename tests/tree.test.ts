import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Root } from 'fumadocs-core/page-tree';
import { createSource } from '../src/node/content/source.js';
import { scan } from '../src/node/content/scan.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'openmd-tree-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

/** Names of a tree level, in order, folders included. */
function names(nodes: Root['children']): string[] {
  return nodes.map((node) => String(node.name));
}

function folder(tree: Root, name: string) {
  const node = tree.children.find((child) => child.type === 'folder' && String(child.name) === name);
  if (node === undefined || node.type !== 'folder') throw new Error(`no folder ${name} in ${names(tree.children)}`);
  return node;
}

describe('page tree', () => {
  it('nests directories', async () => {
    const dir = fixture({
      'index.md': '---\ntitle: Home\n---\n',
      'guide/index.md': '---\ntitle: Guide\n---\n',
      'guide/deep/page.md': '---\ntitle: Deep\n---\n',
    });
    const tree = await createSource({ contentRoot: dir }).getPageTree();
    const guide = folder(tree, 'Guide');
    expect(names(guide.children)).toContain('Deep');
  });

  it('honours meta.json order ahead of everything else', async () => {
    const dir = fixture({
      'guide/a.md': '---\ntitle: Alpha\norder: 1\n---\n',
      'guide/b.md': '---\ntitle: Beta\norder: 2\n---\n',
      'guide/c.md': '---\ntitle: Gamma\n---\n',
      'guide/meta.json': JSON.stringify({ title: 'Guide', pages: ['c', 'b', 'a'] }),
    });
    const tree = await createSource({ contentRoot: dir }).getPageTree();
    expect(names(folder(tree, 'Guide').children)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('honours frontmatter order when there is no meta.json', async () => {
    const dir = fixture({
      'guide/a.md': '---\ntitle: Alpha\norder: 3\n---\n',
      'guide/b.md': '---\ntitle: Beta\norder: 1\n---\n',
      'guide/c.md': '---\ntitle: Gamma\norder: 2\n---\n',
    });
    const tree = await createSource({ contentRoot: dir }).getPageTree();
    expect(names(folder(tree, 'Guide').children)).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('sorts unordered pages after ordered ones, alphabetically by title', async () => {
    const dir = fixture({
      'guide/z.md': '---\ntitle: Zebra\norder: 1\n---\n',
      'guide/m.md': '---\ntitle: Mango\n---\n',
      'guide/a.md': '---\ntitle: Apple\n---\n',
    });
    const tree = await createSource({ contentRoot: dir }).getPageTree();
    expect(names(folder(tree, 'Guide').children)[0]).toBe('Zebra');
  });

  it('falls back to alphabetical order with no ordering hints at all', async () => {
    const dir = fixture({
      'guide/b.md': '---\ntitle: Beta\n---\n',
      'guide/a.md': '---\ntitle: Alpha\n---\n',
    });
    const tree = await createSource({ contentRoot: dir }).getPageTree();
    expect(names(folder(tree, 'Guide').children)).toEqual(['Alpha', 'Beta']);
  });

  it('derives a title from the filename when frontmatter has none', async () => {
    const dir = fixture({ 'getting-started.md': '# hi\n' });
    const [page] = scan({ contentRoot: dir }).pages;
    expect(page!.data.title).toBe('Getting Started');
  });

  it('titles a root index page with the site title', async () => {
    const dir = fixture({ 'index.md': '# hi\n' });
    const [page] = scan({ contentRoot: dir, siteTitle: 'My Docs' }).pages;
    expect(page!.data.title).toBe('My Docs');
  });
});

describe('excludes', () => {
  it('skips node_modules, dotfiles, dist and CHANGELOG by default', () => {
    const dir = fixture({
      'ok.md': '# ok\n',
      'node_modules/pkg/readme.md': '# no\n',
      'dist/out.md': '# no\n',
      '.hidden/secret.md': '# no\n',
      'CHANGELOG.md': '# no\n',
    });
    expect(scan({ contentRoot: dir }).pages.map((p) => p.file)).toEqual(['ok.md']);
  });

  it('appends user excludes rather than replacing the defaults', () => {
    const dir = fixture({
      'ok.md': '# ok\n',
      'drafts/wip.md': '# no\n',
      'node_modules/pkg/readme.md': '# no\n',
    });
    const files = scan({ contentRoot: dir, exclude: ['drafts/**'] }).pages.map((p) => p.file);
    expect(files).toEqual(['ok.md']);
  });

  it('drops draft pages from a build but keeps them in dev', () => {
    const dir = fixture({ 'a.md': '---\ndraft: true\n---\n' });
    expect(scan({ contentRoot: dir }).pages).toHaveLength(0);
    expect(scan({ contentRoot: dir, includeDrafts: true }).pages).toHaveLength(1);
  });
});

describe('refresh', () => {
  it('picks up a new file without recreating the source', async () => {
    const dir = fixture({ 'a.md': '---\ntitle: A\n---\n' });
    const source = createSource({ contentRoot: dir });
    expect(names((await source.getPageTree()).children)).toEqual(['A']);

    writeFileSync(join(dir, 'b.md'), '---\ntitle: B\n---\n');
    source.refresh();
    expect(names((await source.getPageTree()).children)).toEqual(['A', 'B']);
  });

  it('reflects a frontmatter title change without recreating the source', async () => {
    const dir = fixture({ 'a.md': '---\ntitle: Before\n---\n' });
    const source = createSource({ contentRoot: dir });
    expect(names((await source.getPageTree()).children)).toEqual(['Before']);

    writeFileSync(join(dir, 'a.md'), '---\ntitle: After\n---\n');
    source.refresh();
    expect(names((await source.getPageTree()).children)).toEqual(['After']);
  });
});
