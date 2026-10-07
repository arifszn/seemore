import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  app = await electron.launch({
    args: [APP_DIR, ...paths],
    cwd: '/',
    env: { ...process.env, SEEMORE_USER_DATA: userData, SEEMORE_E2E: '1' } as Record<string, string>,
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

async function settled(page: Page, pathname: string): Promise<void> {
  await page.waitForURL((url) => url.pathname === pathname);
  await page.waitForSelector('article h1, h1');
}

describe('desktop app', () => {
  it('opens a folder as a site, titled by the folder and the page', async () => {
    await launch(site);
    const page = await app!.firstWindow();
    await settled(page, '/');

    const title = () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle());
    // The home page's own title is the site title.
    await expect.poll(title).toBe('site - E2E');
    await open(join(site, 'guide', 'intro.md'));
    await expect.poll(title).toMatch(/^site - Intro/);
  });

  it('shows a file from inside an open site in that site’s window', async () => {
    await launch(site);
    const page = await app!.firstWindow();
    await settled(page, '/');

    await open(join(site, 'guide', 'intro.md'));
    await settled(page, '/guide/intro');
    expect(app!.windows()).toHaveLength(1);
  });

  it('lands on the home page and explains when the file is excluded', async () => {
    await launch(join(site, 'secret.md'));
    const page = await app!.firstWindow();
    await settled(page, '/');
    await expect.poll(() => recorded('dialogs')).toContainEqual(expect.stringMatching(/secret\.md isn't part of this site/));
  });

  it('sends a hand-written external link to the browser and stays put', async () => {
    await launch(join(site, 'links.mdx'));
    const page = await app!.firstWindow();
    await settled(page, '/links');

    // Through the DOM: Playwright's click would wait for a navigation the app cancels.
    await page.evaluate(() => document.getElementById('out')!.click());
    await expect.poll(() => recorded('opened')).toEqual(['https://example.com/']);
    expect(new URL(page.url()).pathname).toBe('/links');
  });

  it('never opens a window for window.open; the URL goes to the browser', async () => {
    await launch(join(site, 'links.mdx'));
    const page = await app!.firstWindow();
    await settled(page, '/links');

    await page.click('#popup');
    await expect.poll(() => recorded('opened')).toEqual(['https://example.com/popup']);
    expect(app!.windows()).toHaveLength(1);
  });

  it('lets a page write to the clipboard, the one permission it has', async () => {
    await launch(site);
    const page = await app!.firstWindow();
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

  it('opens a second window on the same server', async () => {
    await launch(site);
    const page = await app!.firstWindow();
    await settled(page, '/');

    const second = app!.waitForEvent('window');
    await open(site, true);
    const other = await second;
    await settled(other, '/');
    expect(new URL(other.url()).origin).toBe(new URL(page.url()).origin);
  });

  it('reopens the last session’s windows on a launch with no path', async () => {
    await launch(site);
    const page = await app!.firstWindow();
    await settled(page, '/');
    await open(join(site, 'guide', 'intro.md'));
    await settled(page, '/guide/intro');
    await app!.close();

    await launch();
    const restored = await app!.firstWindow();
    await settled(restored, '/guide/intro');
  });

  it('hands a second launch’s path, relative to its own cwd, to the running app', async () => {
    await launch(site);
    const page = await app!.firstWindow();
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
    expect(app!.windows()).toHaveLength(1);
  });

  it('shows the start screen when there is nothing to restore', async () => {
    await launch();
    const page = await app!.firstWindow();
    await page.waitForSelector('#open-folder');
    expect(page.url()).toMatch(/^file:.*index\.html/);
  });

  it('offers a restart when the server crashes, and comes back on a new server', async () => {
    await launch(site);
    const page = await app!.firstWindow();
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
    const page = await app!.firstWindow();
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
    const page = await app!.firstWindow();
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
    const page = await app!.firstWindow();
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
});
