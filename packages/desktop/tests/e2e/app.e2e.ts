import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packCli } from '../../scripts/pack-cli.mjs';

const APP_DIR = join(import.meta.dirname, '..', '..');

let workDir: string;
let site: string;
let userData: string;
let app: ElectronApplication | undefined;

beforeEach(() => {
  workDir = realpathSync(mkdtempSync(join(tmpdir(), 'seemore-desktop-e2e-')));
  site = join(workDir, 'site');
  userData = join(workDir, 'user-data');
  mkdirSync(join(site, 'guide'), { recursive: true });
  writeFileSync(join(site, 'index.md'), '# Home\n\nSee [intro](guide/intro.md).\n');
  writeFileSync(join(site, 'guide', 'intro.md'), '# Intro\n');
  writeFileSync(join(site, 'secret.md'), '# Secret\n');
  writeFileSync(
    join(site, 'links.mdx'),
    '# Links\n\n<a id="out" href="https://example.com/">out</a>\n\n<button id="popup" onClick={() => window.open("https://example.com/popup")}>popup</button>\n',
  );
  writeFileSync(join(site, 'seemore.config.ts'), "export default { title: 'E2E', exclude: ['secret.md'] };\n");
});

afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  rmSync(workDir, { recursive: true, force: true });
});

async function launch(...paths: string[]): Promise<ElectronApplication> {
  return launchWithEnv({}, ...paths);
}

async function launchWithEnv(env: Record<string, string>, ...paths: string[]): Promise<ElectronApplication> {
  app = await electron.launch({
    args: [APP_DIR, ...paths],
    cwd: '/',
    env: { ...process.env, SEEMORE_USER_DATA: userData, SEEMORE_E2E: '1', ...env } as Record<string, string>,
  });
  // Dialogs would block the run; record them and answer with the default (or a set) button.
  await app.evaluate(({ dialog, shell }) => {
    const g = globalThis as Record<string, unknown>;
    g.dialogs = [];
    g.dialogResponse = undefined;
    g.opened = [];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as { message: string; defaultId?: number };
      (g.dialogs as string[]).push(options.message);
      return { response: (g.dialogResponse as number | undefined) ?? options.defaultId ?? 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
    shell.openExternal = (async (url: string) => {
      (g.opened as string[]).push(url);
    }) as typeof shell.openExternal;
  });
  return app;
}

const open = (target: string, newWindow = false) =>
  app!.evaluate(
    async (_electron, [path, fresh]) =>
      (globalThis as unknown as { seemoreDesktop: { open: (p: string, o: object) => Promise<void> } }).seemoreDesktop.open(
        path,
        { newWindow: fresh },
      ),
    [target, newWindow] as const,
  );

const recorded = (key: 'dialogs' | 'opened') =>
  app!.evaluate((_electron, name) => (globalThis as Record<string, unknown>)[name] as string[], key);

/**
 * A site window's own page, once it is on the server. Not `firstWindow()`: until the site
 * loads, the window's "Opening…" overlay (§5) is a page of its own, closed when the site loads.
 */
async function sitePage(except: Page[] = []): Promise<Page> {
  const find = () => app!.windows().find((w) => w.url().startsWith('http') && !except.includes(w));
  await expect.poll(() => find() !== undefined, { timeout: 60_000 }).toBe(true);
  return find()!;
}

/** Site pages open in the app; each site window also has its terminal page (§7.4). */
const sitePages = () => app!.windows().filter((w) => w.url().startsWith('http'));

async function settled(page: Page, pathname: string): Promise<void> {
  await page.waitForURL((url) => url.pathname === pathname);
  await page.waitForSelector('article h1, h1');
}

describe('desktop app', () => {
  it('opens a folder as a site, titled by the folder and the page', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    const title = () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());
    // The home page's own title is the site title.
    await expect.poll(title).toBe('site - E2E');
    await open(join(site, 'guide', 'intro.md'));
    await expect.poll(title).toMatch(/^site - Intro/);
  });

  it('shows a file from inside an open site in that site’s window', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    await open(join(site, 'guide', 'intro.md'));
    await settled(page, '/guide/intro');
    expect(sitePages()).toHaveLength(1);
  });

  it('lands on the home page and explains when the file is excluded', async () => {
    await launch(join(site, 'secret.md'));
    const page = await sitePage();
    await settled(page, '/');
    await expect.poll(() => recorded('dialogs')).toContainEqual(expect.stringMatching(/secret\.md isn't part of this site/));
  });

  it('sends a hand-written external link to the browser and stays put', async () => {
    await launch(join(site, 'links.mdx'));
    const page = await sitePage();
    await settled(page, '/links');

    // Through the DOM: Playwright's click would wait for a navigation the app cancels.
    await page.evaluate(() => document.getElementById('out')!.click());
    await expect.poll(() => recorded('opened')).toEqual(['https://example.com/']);
    expect(new URL(page.url()).pathname).toBe('/links');
  });

  it('never opens a window for window.open; the URL goes to the browser', async () => {
    await launch(join(site, 'links.mdx'));
    const page = await sitePage();
    await settled(page, '/links');

    await page.click('#popup');
    await expect.poll(() => recorded('opened')).toEqual(['https://example.com/popup']);
    expect(sitePages()).toHaveLength(1);
  });

  it('lets a page write to the clipboard, the one permission it has', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    await page.bringToFront();
    const result = await page.evaluate(() =>
      navigator.clipboard.writeText('copied').then(
        () => 'ok',
        (error: Error) => error.name,
      ),
    );
    expect(result).toBe('ok');
    const denied = await page.evaluate(() =>
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((status) => status.state),
    );
    expect(denied).toBe('denied');
  });

  it('shows a window with an opening page at once, removed when the site loads', async () => {
    await launch(site);
    const opening = () => app!.windows().find((w) => w.url().includes('opening.html'));
    await expect.poll(() => opening() !== undefined, { timeout: 10_000 }).toBe(true);
    expect(await opening()!.textContent('#label')).toBe(`Opening ${basename(site)}…`);

    const page = await sitePage();
    await settled(page, '/');
    await expect.poll(() => opening() === undefined).toBe(true);
    // The site view and the terminal panel (§7.4).
    expect(await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.contentView.children.length))).toEqual([2]);
  });

  it('opens a second window on the same server', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    await open(site, true);
    const other = await sitePage([page]);
    await settled(other, '/');
    expect(new URL(other.url()).origin).toBe(new URL(page.url()).origin);
  });

  it('reopens the last session’s windows on a launch with no path', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');
    await open(join(site, 'guide', 'intro.md'));
    await settled(page, '/guide/intro');
    await app!.close();

    await launch();
    const restored = await sitePage();
    await settled(restored, '/guide/intro');
  });

  it('hands a second launch’s path, relative to its own cwd, to the running app', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
    const second = spawnSync(electronPath, [APP_DIR, join('guide', 'intro.md')], {
      cwd: site,
      env: { ...process.env, SEEMORE_USER_DATA: userData },
      timeout: 30_000,
    });
    // It found the lock held, handed over its argv, and quit.
    expect(second.status).toBe(0);
    await settled(page, '/guide/intro');
    expect(sitePages()).toHaveLength(1);
  });

  it('shows the start screen when there is nothing to restore', async () => {
    await launch();
    const page = await app!.firstWindow();
    await page.waitForSelector('#open-folder');
    expect(page.url()).toMatch(/^file:.*index\.html/);
  });

  it('closes the folder into a start screen, and leaves it out of the session', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    expect(await app!.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('close-folder')?.label)).toBe(
      'Close Folder',
    );
    await app!.evaluate(({ BrowserWindow }) =>
      (globalThis as unknown as { seemoreDesktop: { closeFolder: (w: unknown) => void } }).seemoreDesktop.closeFolder(
        BrowserWindow.getAllWindows()[0],
      ),
    );

    const start = () => app!.windows().find((w) => w.url().startsWith('file:') && w.url().includes('index.html'));
    await expect.poll(() => start() !== undefined).toBe(true);
    await start()!.waitForSelector('#open-folder');
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await app!.close();

    await launch();
    const relaunched = await app!.firstWindow();
    await relaunched.waitForSelector('#open-folder');
  });

  it('offers a restart when the server crashes, and comes back on a new server', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');
    const before = new URL(page.url()).origin;

    await app!.evaluate(({ app: electronApp }) => {
      const server = electronApp.getAppMetrics().find((metric) => metric.name?.startsWith('seemore '));
      if (server === undefined) throw new Error('no seemore utility process');
      process.kill(server.pid, 'SIGKILL');
    });

    await expect.poll(() => recorded('dialogs')).toContainEqual(expect.stringMatching(/server for site stopped/));
    await page.waitForURL((url) => url.protocol === 'http:' && url.origin !== before);
    await settled(page, '/');
  });

  it('exports the current page as HTML, against the window’s root', async () => {
    await launch(join(site, 'guide', 'intro.md'));
    const page = await sitePage();
    await settled(page, '/guide/intro');

    const out = join(workDir, 'Chosen Name.html');
    await app!.evaluate(({ dialog }, chosen) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: chosen })) as typeof dialog.showSaveDialog;
    }, out);
    await app!.evaluate(({ BrowserWindow }) =>
      (globalThis as unknown as { seemoreDesktop: { exportPage: (w: unknown) => Promise<void> } }).seemoreDesktop.exportPage(
        BrowserWindow.getAllWindows()[0],
      ),
    );

    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toContain('<title>Intro · E2E</title>');
    expect(await recorded('dialogs')).toContain('Exported Chosen Name.html');
  });

  it('does not export from a site whose pageActions leave it out', async () => {
    writeFileSync(join(site, 'seemore.config.ts'), "export default { title: 'E2E', pageActions: [] };\n");
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    const asked = await app!.evaluate(async ({ BrowserWindow, dialog }) => {
      let called = false;
      dialog.showSaveDialog = (async () => {
        called = true;
        return { canceled: true, filePath: undefined };
      }) as unknown as typeof dialog.showSaveDialog;
      await (globalThis as unknown as { seemoreDesktop: { exportPage: (w: unknown) => Promise<void> } }).seemoreDesktop.exportPage(
        BrowserWindow.getAllWindows()[0],
      );
      return called;
    });
    expect(asked).toBe(false);
  });

  it('builds the site from the sheet, with the password passed to that build only', async () => {
    writeFileSync(join(site, 'seemore.config.ts'), "export default { title: 'E2E', auth: true };\n");
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    const sheetOpened = app!.waitForEvent('window');
    await app!.evaluate(({ BrowserWindow }) =>
      (globalThis as unknown as { seemoreDesktop: { buildSite: (w: unknown) => Promise<void> } }).seemoreDesktop.buildSite(
        BrowserWindow.getAllWindows()[0],
      ),
    );
    const sheet = await sheetOpened;
    await sheet.waitForSelector('#password-row:not([hidden])');
    expect(await sheet.textContent('#out-dir')).toBe(join(site, 'dist'));

    await sheet.fill('#password', 'hunter2');
    await sheet.click('#build');
    await sheet.waitForSelector('#result:not([hidden])', { timeout: 120_000 });
    expect(await sheet.textContent('#status')).toBe(`Built into ${join(site, 'dist')}`);
    expect(existsSync(join(site, 'dist', 'index.html'))).toBe(true);
    expect(await sheet.textContent('#log')).not.toBe('');
    expect(await app!.evaluate(() => process.env.SEEMORE_PASSWORD)).toBeUndefined();
  });

  it('opens the terminal panel below the site, resizes it, and restores it on relaunch', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');

    const layout = () =>
      app!.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        return {
          content: window.getContentBounds().height,
          views: window.contentView.children.map((view) => ({ ...view.getBounds(), visible: view.getVisible() })),
        };
      });
    const toggle = () =>
      app!.evaluate(({ BrowserWindow }) =>
        (globalThis as unknown as { seemoreDesktop: { toggleTerminal: (w: unknown) => void } }).seemoreDesktop.toggleTerminal(
          BrowserWindow.getAllWindows()[0],
        ),
      );

    // Open by default, so the terminal is there to be found.
    const terminal = () => app!.windows().find((w) => w.url().endsWith('terminal.html'));
    await expect.poll(() => terminal() !== undefined).toBe(true);
    await terminal()!.waitForSelector('#splitter');
    let { content, views } = await layout();
    expect(views[1]).toMatchObject({ y: content - 280, height: 280, visible: true });
    expect(views[0]!.height).toBe(content - 280);

    // A splitter drag 100 px up, as the page reports it.
    await terminal()!.evaluate(() => {
      const api = (window as unknown as { seemore: { drag: (phase: string, y: number) => void } }).seemore;
      api.drag('start', 500);
      api.drag('move', 450);
      api.drag('end', 400);
    });
    await expect.poll(async () => (await layout()).views[1]!.height).toBe(380);

    await toggle();
    ({ content, views } = await layout());
    expect(views[0]!.height).toBe(content);
    expect(views[1]!.visible).toBe(false);

    // Hidden stays hidden for this root; the height is kept for the next time it opens.
    await app!.close();
    await launch();
    await sitePage();
    await expect.poll(async () => (await layout()).views).toHaveLength(1);
    await toggle();
    await expect.poll(async () => (await layout()).views.find((v) => v.visible && v.y > 0)?.height).toBe(380);
  });

  it('runs shells at the site root in the terminal page, with tabs, find and links', async () => {
    await launch(site);
    const page = await sitePage();
    await settled(page, '/');
    const find = () => app!.windows().find((w) => w.url().endsWith('terminal.html'));
    await expect.poll(() => find() !== undefined).toBe(true);
    const terminal = find()!;

    const shellPids = () =>
      app!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().flatMap((window) =>
          (globalThis as unknown as { seemoreDesktop: { shellPids: (w: unknown) => number[] } }).seemoreDesktop.shellPids(window),
        ),
      );
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const screen = () => terminal.evaluate(() => document.querySelector('.terminal-host:not([hidden]) .xterm-rows')?.textContent ?? '');

    // The panel opens with the window and starts a shell at the root.
    await terminal.waitForSelector('.terminal-host .xterm');
    await expect.poll(shellPids).toHaveLength(1);
    const probe = process.platform === 'win32' ? '(Get-Location).Path' : 'echo "$PWD"';
    await terminal.keyboard.type(`${probe}; echo https://example.com/docs\n`);
    await expect.poll(screen, { timeout: 20_000 }).toContain(site);

    // A link in the output opens in the browser.
    const link = await terminal.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.terminal-host:not([hidden]) .xterm-rows > div'));
      const row = rows.find((r) => r.textContent?.startsWith('https://example.com/docs'))!;
      const text = document.createTreeWalker(row, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange();
      range.setStart(text, 10);
      range.setEnd(text, 11);
      const box = range.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await terminal.mouse.move(link.x, link.y);
    await terminal.mouse.click(link.x, link.y);
    await expect.poll(() => recorded('opened')).toEqual(['https://example.com/docs']);

    // Find highlights a match in the active terminal.
    await terminal.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await terminal.waitForSelector('#find:not([hidden])');
    await terminal.keyboard.type('example');
    expect(await terminal.textContent('#find-status')).toBe('');
    await terminal.keyboard.press('Escape');
    await terminal.waitForSelector('#find', { state: 'hidden' });

    // A second terminal brings up the tabs list.
    await terminal.click('#new');
    await expect.poll(shellPids).toHaveLength(2);
    await terminal.waitForSelector('#tabs li:nth-child(2).active');
    expect(await terminal.isVisible('#tabs')).toBe(true);
    const [first, second] = await shellPids();

    // The Terminal menu's items, clicked as the menu would (its shortcuts never reach the
    // menu from a synthetic key press).
    const clickMenu = (id: string) =>
      app!.evaluate(({ Menu, BrowserWindow }, itemId) => {
        const item = Menu.getApplicationMenu()!.getMenuItemById(itemId)!;
        if (!item.enabled) throw new Error(`${itemId} is disabled`);
        item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
      }, id);
    const activeTab = () => terminal.$$eval('#tabs li', (tabs) => tabs.findIndex((tab) => tab.classList.contains('active')));
    await clickMenu('terminal-previous');
    await expect.poll(activeTab).toBe(0);
    await clickMenu('terminal-next');
    await expect.poll(activeTab).toBe(1);
    await clickMenu('terminal-rename');
    await terminal.waitForSelector('#tabs li.active input.rename');
    await terminal.fill('#tabs li.active input.rename', 'server');
    await terminal.press('#tabs li.active input.rename', 'Enter');
    await expect.poll(() => terminal.textContent('#tabs li.active .name')).toBe('server');

    // View > Reload reloads the site, not the focused terminal, whose shells keep running.
    const reloaded = page.waitForEvent('load');
    await app!.evaluate(({ Menu, BrowserWindow }) => {
      const view = Menu.getApplicationMenu()!.items.find((item) => item.label === 'View')!;
      view.submenu!.items.find((item) => item.label === 'Reload')!.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
    });
    await reloaded;
    expect(await shellPids()).toEqual([first, second]);

    // Killing the first from its tab ends its process and hides the list again.
    await terminal.hover('#tabs li:first-child');
    await terminal.click('#tabs li:first-child .kill');
    await expect.poll(() => alive(first!), { timeout: 10_000 }).toBe(false);
    await expect.poll(shellPids).toEqual([second]);
    await terminal.waitForSelector('#tabs', { state: 'hidden' });

    // Closing the window leaves no shell running.
    await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await expect.poll(() => alive(second!), { timeout: 10_000 }).toBe(false);
  });

  // The staged CLI is trimmed (scripts/trim-seemore.mjs); the two largest client-side
  // dependencies must still load from it.
  it('renders mermaid and D2 diagrams with the trimmed CLI', async () => {
    writeFileSync(join(site, 'diagrams.md'), '# Diagrams\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```d2\nx -> y\n```\n');
    await launch(join(site, 'diagrams.md'));
    const page = await sitePage();
    await settled(page, '/diagrams');

    await page.waitForSelector('.seemore-mermaid svg', { timeout: 60_000 });
    await page.waitForSelector('.seemore-d2 svg', { timeout: 60_000 });
    expect(await page.$('.seemore-mermaid-error, .seemore-d2-error')).toBeNull();
  });

  // Windows' packaged path (§9), run here through SEEMORE_CLI_ARCHIVE.
  it('unpacks the CLI archive on first launch and serves the site from it', async () => {
    const archiveDir = join(workDir, 'archive');
    const { sha256 } = await packCli(join(APP_DIR, 'build', 'stage', 'seemore'), archiveDir, { quality: 1 });
    await launchWithEnv({ SEEMORE_CLI_ARCHIVE: archiveDir }, site);
    // The first window is the one showing the unpacking; the site's comes after it.
    const page = await sitePage();
    await settled(page, '/');

    const unpacked = join(userData, 'cli', sha256.slice(0, 16));
    expect(existsSync(join(unpacked, 'node_modules', 'seemore', 'dist', 'cli', 'index.js'))).toBe(true);
    expect(app!.windows().filter((w) => w.url().startsWith('file:') && w.url().endsWith('preparing.html'))).toHaveLength(0);
  });
});
