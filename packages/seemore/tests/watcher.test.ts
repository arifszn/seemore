import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SerializedPageTree } from 'fumadocs-core/source/client';
import { runDev, type DevServer } from '../src/cli/dev.js';
import { isWatchIgnored } from '../src/node/vite/watcher.js';

interface SerializedNode {
  name: string;
  url?: string;
  children?: SerializedNode[];
}

/**
 * Names at the top level of the tree, in order — what the sidebar renders.
 *
 * Read from the serialized payload, because that is exactly what `virtual:seemore/tree`
 * hands the browser.
 */
function names(serialized: SerializedPageTree): string[] {
  const data = serialized.data as { children: SerializedNode[] };
  return data.children.map((child) => child.name);
}

describe('watcher / sidebar refresh cycle', () => {
  let contentRoot: string;
  let dev: DevServer;
  let messages: unknown[];

  async function tree(): Promise<SerializedPageTree> {
    const loaded = (await dev.server.ssrLoadModule('virtual:seemore/tree')) as {
      getTree: () => SerializedPageTree;
    };
    return loaded.getTree();
  }

  /** Poll until the sidebar catches up, so the test measures the cycle, not chokidar's clock. */
  async function waitForNames(expected: string[]): Promise<string[]> {
    const deadline = Date.now() + 20_000;
    let actual: string[] = [];
    while (Date.now() < deadline) {
      actual = names(await tree());
      if (actual.join('|') === expected.join('|')) return actual;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return actual;
  }

  beforeAll(async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-watch-'));
    writeFileSync(join(contentRoot, 'alpha.md'), '---\ntitle: Alpha\norder: 1\n---\n\n# Alpha\n');
    writeFileSync(join(contentRoot, 'beta.md'), '---\ntitle: Beta\norder: 2\n---\n\n# Beta\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });

    // The server canonicalises the root through the filesystem (Windows 8.3 short names,
    // symlinked tmpdirs), so modules must be addressed by the spelling it uses.
    contentRoot = dev.ctx.contentRoot;

    // Pull the virtual modules into the client graph, as a connected browser would. Without
    // a client-side copy there is nothing for an HMR update to be about.
    for (const id of ['virtual:seemore/tree', 'virtual:seemore/routes']) {
      await dev.server.environments.client.transformRequest(id);
    }

    messages = [];
    const hot = dev.server.environments.client.hot;
    const send = hot.send.bind(hot);
    hot.send = ((...args: unknown[]) => {
      messages.push(args[0]);
      return (send as (...a: unknown[]) => unknown)(...args);
    }) as typeof hot.send;
  }, 120_000);

  afterAll(async () => {
    await dev?.close();
    rmSync(contentRoot, { recursive: true, force: true });
  });

  it('starts with the corpus it was pointed at', async () => {
    expect(names(await tree())).toEqual(['Alpha', 'Beta']);
  });

  it('picks up a created file with no restart', async () => {
    writeFileSync(join(contentRoot, 'gamma.md'), '---\ntitle: Gamma\norder: 3\n---\n\n# Gamma\n');
    expect(await waitForNames(['Alpha', 'Beta', 'Gamma'])).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sends an HMR update rather than asking the page to reload', () => {
    expect(messages.length).toBeGreaterThan(0);
    const types = messages.map((message) => (message as { type?: string }).type);
    expect(types).toContain('update');
    expect(types).not.toContain('full-reload');
  });

  it('picks up a rename with no restart', async () => {
    renameSync(join(contentRoot, 'gamma.md'), join(contentRoot, 'delta.md'));
    writeFileSync(join(contentRoot, 'delta.md'), '---\ntitle: Delta\norder: 3\n---\n\n# Delta\n');
    expect(await waitForNames(['Alpha', 'Beta', 'Delta'])).toEqual(['Alpha', 'Beta', 'Delta']);
  });

  it('re-titles the sidebar when frontmatter changes', async () => {
    writeFileSync(join(contentRoot, 'delta.md'), '---\ntitle: Renamed\norder: 3\n---\n\n# Renamed\n');
    expect(await waitForNames(['Alpha', 'Beta', 'Renamed'])).toEqual(['Alpha', 'Beta', 'Renamed']);
  });

  it('re-sorts the sidebar when frontmatter order changes', async () => {
    writeFileSync(join(contentRoot, 'delta.md'), '---\ntitle: Renamed\norder: 0\n---\n\n# Renamed\n');
    expect(await waitForNames(['Renamed', 'Alpha', 'Beta'])).toEqual(['Renamed', 'Alpha', 'Beta']);
  });

  it('picks up a new directory with no restart', async () => {
    mkdirSync(join(contentRoot, 'guide'));
    writeFileSync(join(contentRoot, 'guide', 'index.md'), '---\ntitle: Guide\norder: 9\n---\n\n# Guide\n');
    expect(await waitForNames(['Renamed', 'Alpha', 'Beta', 'Guide'])).toEqual([
      'Renamed',
      'Alpha',
      'Beta',
      'Guide',
    ]);
  });

  it('picks up a deletion with no restart', async () => {
    rmSync(join(contentRoot, 'delta.md'));
    expect(await waitForNames(['Alpha', 'Beta', 'Guide'])).toEqual(['Alpha', 'Beta', 'Guide']);
  });

  it('swaps a body edit in place instead of reloading the page', async () => {
    await dev.server.environments.client.transformRequest(join(contentRoot, 'alpha.md').replace(/\\/g, '/'));
    messages.length = 0;

    writeFileSync(join(contentRoot, 'alpha.md'), '---\ntitle: Alpha\norder: 1\n---\n\n# Alpha\n\nEdited body.\n');

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && messages.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const types = messages.map((message) => (message as { type?: string }).type);
    expect(types).toContain('update');
    expect(types).not.toContain('full-reload');
  });

  it('serves the search index at the same path the build writes it to', async () => {
    const response = await fetch(new URL('/api/search.json', dev.url));
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain('Alpha');
  });
});

describe('isWatchIgnored', () => {
  it('judges only the part of the path below the content root', () => {
    expect(isWatchIgnored('', false, [])).toBe(false);
    expect(isWatchIgnored('guide.md', true, [])).toBe(false);
    expect(isWatchIgnored('.drafts', false, [])).toBe(true);
    expect(isWatchIgnored('node_modules/pkg/readme.md', true, [])).toBe(true);
    expect(isWatchIgnored('notes.txt', true, [])).toBe(true);
  });

  it('opens an excluded folder, and the folders on the way to it, when include reaches it', () => {
    const include = ['.config/.drafts/**'];
    expect(isWatchIgnored('.config', false, include)).toBe(false);
    expect(isWatchIgnored('.config/.drafts', false, include)).toBe(false);
    expect(isWatchIgnored('.config/.drafts/wip.md', true, include)).toBe(false);
    expect(isWatchIgnored('.config/.other', false, include)).toBe(true);
  });

  it('keeps dependency trees closed for an include that starts with a glob', () => {
    const include = ['**/.notes/**'];
    expect(isWatchIgnored('a/.notes', false, include)).toBe(false);
    expect(isWatchIgnored('node_modules', false, include)).toBe(true);
    expect(isWatchIgnored('.git', false, include)).toBe(true);
  });
});

describe('watcher under a content root inside dot and build folders', () => {
  let parent: string;
  let contentRoot: string;
  let dev: DevServer;

  /** Poll the corpus the watcher keeps current, for the same reason as `waitForNames` above. */
  async function waitForFiles(expected: string[]): Promise<string[]> {
    const deadline = Date.now() + 20_000;
    let files: string[] = [];
    while (Date.now() < deadline) {
      files = dev.ctx.pages().map((p) => p.file).sort();
      if (files.join('|') === expected.join('|')) return files;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return files;
  }

  beforeAll(async () => {
    parent = mkdtempSync(join(tmpdir(), 'seemore-watch-dot-'));
    const root = join(parent, '.github', 'build', 'docs');
    mkdirSync(join(root, '.drafts'), { recursive: true });
    writeFileSync(join(root, 'alpha.md'), '# Alpha\n');
    writeFileSync(join(root, 'seemore.config.ts'), "export default { title: 'Dotted', include: ['.drafts'] };");

    dev = await runDev({ cwd: root, port: 0 });
    contentRoot = dev.ctx.contentRoot;
  }, 120_000);

  afterAll(async () => {
    await dev?.close();
    rmSync(parent, { recursive: true, force: true });
  });

  it('picks up a created file even though the root sits under .github/build', async () => {
    writeFileSync(join(contentRoot, 'beta.md'), '# Beta\n');
    expect(await waitForFiles(['alpha.md', 'beta.md'])).toEqual(['alpha.md', 'beta.md']);
  });

  it('picks up a file in an included dot folder', async () => {
    writeFileSync(join(contentRoot, '.drafts', 'wip.md'), '# WIP\n');
    expect(await waitForFiles(['.drafts/wip.md', 'alpha.md', 'beta.md'])).toEqual([
      '.drafts/wip.md',
      'alpha.md',
      'beta.md',
    ]);
  });
});
