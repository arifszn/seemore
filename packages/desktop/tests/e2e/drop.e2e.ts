import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterEach, beforeEach, expect, it } from 'vitest';

const APP_DIR = join(import.meta.dirname, '..', '..');

let workDir: string;
let app: ElectronApplication | undefined;

beforeEach(() => {
  workDir = realpathSync(mkdtempSync(join(tmpdir(), 'seemore-desktop-drop-')));
  for (const name of ['a', 'b']) {
    mkdirSync(join(workDir, name));
    writeFileSync(join(workDir, name, 'index.md'), `# Site ${name}\n`);
    writeFileSync(join(workDir, name, 'other.md'), `# Other ${name}\n`);
  }
});

afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  rmSync(workDir, { recursive: true, force: true });
});

/** A file dragged from outside the page and dropped on it, through Chromium's drag input. */
async function drop(page: Page, file: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [file], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cdp.send('Input.dispatchDragEvent', { type, x: 200, y: 200, data });
  }
}

it('opens a file dropped on a site window as its own site, leaving the window where it was', async () => {
  app = await electron.launch({
    args: [APP_DIR, join(workDir, 'a')],
    cwd: '/',
    env: { ...process.env, SEEMORE_USER_DATA: join(workDir, 'user-data'), SEEMORE_E2E: '1' } as Record<string, string>,
  });
  const siteUrls = () => app!.windows().map((w) => w.url()).filter((u) => u.startsWith('http'));
  await expect.poll(() => siteUrls().length, { timeout: 60_000 }).toBe(1);
  const page = app.windows().find((w) => w.url().startsWith('http'))!;
  await page.waitForSelector('h1');
  const before = page.url();

  await drop(page, join(workDir, 'b', 'other.md'));
  await expect.poll(() => siteUrls().filter((u) => u.endsWith('/other')).length, { timeout: 60_000 }).toBe(1);
  expect(page.url()).toBe(before);
});
