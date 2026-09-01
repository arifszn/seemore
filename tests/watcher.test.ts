import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SerializedPageTree } from 'fumadocs-core/source/client';
import { runDev, type DevServer } from '../src/cli/dev.js';

interface SerializedNode {
  name: string;
  url?: string;
  children?: SerializedNode[];
}

/**
 * Names at the top level of the tree, in order — what the sidebar renders.
 *
 * Read from the serialized payload, because that is exactly what `virtual:openmd/tree`
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
    const loaded = (await dev.server.ssrLoadModule('virtual:openmd/tree')) as {
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
    contentRoot = mkdtempSync(join(tmpdir(), 'openmd-watch-'));
    writeFileSync(join(contentRoot, 'alpha.md'), '---\ntitle: Alpha\norder: 1\n---\n\n# Alpha\n');
    writeFileSync(join(contentRoot, 'beta.md'), '---\ntitle: Beta\norder: 2\n---\n\n# Beta\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });

    // Pull the virtual modules into the client graph, as a connected browser would. Without
    // a client-side copy there is nothing for an HMR update to be about.
    for (const id of ['virtual:openmd/tree', 'virtual:openmd/routes']) {
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
    await dev.server.environments.client.transformRequest(join(contentRoot, 'alpha.md'));
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
