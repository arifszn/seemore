/**
 * Integration (DESKTOP-SPEC §17): the real staged CLI, run by the app, against a fixture
 * folder. The server checks talk to the dev server the app forked for a window; export and
 * build run through `utilityProcess.fork` in the app's main process, as its jobs do.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const APP_DIR = join(import.meta.dirname, '..', '..');
const CLI = join(APP_DIR, 'build', 'stage', 'seemore', 'node_modules', 'seemore', 'dist', 'cli', 'index.js');

let workDir: string;
let site: string;
let app: ElectronApplication;
let origin: string;

beforeAll(async () => {
  workDir = realpathSync(mkdtempSync(join(tmpdir(), 'seemore-desktop-integration-')));
  site = join(workDir, 'site');
  mkdirSync(join(site, 'guide'), { recursive: true });
  writeFileSync(join(site, 'index.md'), '# Home\n\nSome **bold** text.\n');
  writeFileSync(join(site, 'guide', 'intro.md'), '# Intro\n');
  writeFileSync(join(site, 'notes.markdown'), '# Notes\n');
  writeFileSync(join(site, 'secret.md'), '# Secret\n');
  writeFileSync(join(site, 'seemore.config.ts'), "export default { title: 'Integration', exclude: ['secret.md'] };\n");

  app = await electron.launch({
    args: [APP_DIR, site],
    cwd: '/',
    env: { ...process.env, SEEMORE_USER_DATA: join(workDir, 'user-data'), SEEMORE_E2E: '1' } as Record<string, string>,
  });
  const find = () => app.windows().find((w) => w.url().startsWith('http'));
  for (let waited = 0; find() === undefined; waited += 250) {
    if (waited > 60_000) throw new Error('no site window');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  origin = new URL(find()!.url()).origin;
});

afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(workDir, { recursive: true, force: true });
});

/** Runs the staged CLI in a utility process, with its cwd at `cwd`, and returns the exit code. */
function runCli(args: string[], cwd: string): Promise<number> {
  return app.evaluate(
    ({ utilityProcess }, [entry, argv, dir]) =>
      new Promise<number>((resolve) => {
        const child = utilityProcess.fork(entry, argv, { cwd: dir, stdio: 'pipe' });
        child.stdout?.resume();
        child.stderr?.resume();
        child.on('exit', (code) => resolve(code));
      }),
    [CLI, args, cwd] as const,
  );
}

const route = (file: string) => fetch(`${origin}/__seemore/route?file=${encodeURIComponent(file)}`);

describe('the server the app forks', () => {
  it('answers the route lookup for a page', async () => {
    const res = await route(join(site, 'guide', 'intro.md'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: '/guide/intro' });
  });

  it('answers 404 for a file the site leaves out', async () => {
    expect((await route(join(site, 'secret.md'))).status).toBe(404);
  });

  it('serves a .markdown file as a page', async () => {
    const res = await route(join(site, 'notes.markdown'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: '/notes' });
  });

  it('refuses a write from another origin', async () => {
    const res = await fetch(`${origin}/__seemore/source?file=${encodeURIComponent(join(site, 'index.md'))}`, {
      method: 'PUT',
      headers: { Origin: 'http://localhost:9999', 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '# Overwritten\n' }),
    });
    expect(res.status).toBe(403);
    expect(readFileSync(join(site, 'index.md'), 'utf8')).toContain('# Home');
  });

  it('refuses /@fs/ outside the site, as its cwd is the root', async () => {
    const outside = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/hosts';
    expect((await fetch(`${origin}/@fs${outside.startsWith('/') ? '' : '/'}${outside}`)).status).toBe(403);
  });

  it('builds the search index for a page with bold text', async () => {
    const res = await fetch(`${origin}/api/search.json`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('bold');
  });
});

describe('jobs in a utility process', () => {
  it('exports a page against a given root, to the exact path chosen', async () => {
    const out = join(workDir, 'chosen-name.html');
    const code = await runCli(['export', join(site, 'guide', 'intro.md'), '--root', site, '--out-file', out], site);
    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('Intro');
  });

  it('exits non-zero when a build fails', async () => {
    const empty = join(workDir, 'empty');
    mkdirSync(empty);
    const code = await runCli(['build', empty, '--out', join(workDir, 'empty-out')], empty);
    expect(code).not.toBe(0);
    expect(existsSync(join(workDir, 'empty-out', 'index.html'))).toBe(false);
  });
});
