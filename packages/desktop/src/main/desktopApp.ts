/**
 * The main process's state and its one entry point, `open(path)` (DESKTOP-SPEC §3, §4).
 * Every way in (argv, Finder, the menus, the start screen, a drop) ends here.
 */
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, utilityProcess } from 'electron';
import { buildDevArgs, canonicalise, checkCliVersion, hasSeemoreConfig, readCliVersion } from '@seemore/host';
import pkg from '../../package.json';
import { cliEntry, cliPackageJson } from './cli.js';
import { readJson, writeJson } from './jsonStore.js';
import { buildMenu } from './menu.js';
import { addRecent, parseRecents, type RecentEntry } from './recents.js';
import { type Lease, ServerRegistry } from './serverRegistry.js';
import { createSiteWindow, type SavedBounds } from './siteWindow.js';
import { createStartWindow, registerStartHandlers } from './startWindow.js';
import { resolveTarget } from './target.js';
import { WindowRegistry } from './windowRegistry.js';

interface SiteRecord {
  window: BrowserWindow;
  root: string;
  lease: Lease | undefined;
  origin: string | undefined;
  /** Path, query and hash of the last page shown, to come back to after a restart. */
  lastPath: string;
  rootGoneReported: boolean;
}

interface WindowsFile {
  bounds: Record<string, SavedBounds>;
  /** Windows open at quit, for session restore (§5). */
  session: { root: string; path: string }[];
}

interface StateFile {
  manyServersNoticeShown?: boolean;
}

/** From this many open sites on, the app says once that each runs its own server (§6). */
const MANY_SERVERS = 5;

const MARKDOWN_FILTER = { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] };

export class DesktopApp {
  private readonly windows = new WindowRegistry<number>();
  private readonly records = new Map<number, SiteRecord>();
  private readonly servers: ServerRegistry;
  private readonly paths = {
    recents: join(app.getPath('userData'), 'recents.json'),
    windows: join(app.getPath('userData'), 'windows.json'),
    state: join(app.getPath('userData'), 'state.json'),
  };
  private recentList: RecentEntry[];
  private windowsFile: WindowsFile;
  private state: StateFile;
  /** Opens run one at a time, so files opened together group by root instead of racing. */
  private queue: Promise<void> = Promise.resolve();
  private quitting = false;
  private cliChecked = false;

  constructor() {
    this.recentList = parseRecents(readJson(this.paths.recents));
    this.windowsFile = parseWindowsFile(readJson(this.paths.windows));
    this.state = (readJson(this.paths.state) as StateFile | undefined) ?? {};

    this.servers = new ServerRegistry({
      fork: (root) =>
        utilityProcess.fork(cliEntry(), buildDevArgs(root), {
          // A security setting, not a convenience (§6): seemore allows `process.cwd()` in
          // Vite's `server.fs.allow`, and an app started from Finder has cwd `/`.
          cwd: root,
          stdio: 'pipe',
          serviceName: `seemore ${basename(root)}`,
        }),
      onCrash: (root, stderr) => this.onServerCrash(root, stderr),
    });

    registerStartHandlers({
      openFile: (parent) => this.showOpenFile(parent),
      openFolder: (parent) => this.showOpenFolder(parent),
      openRecent: (path) => this.open(path).then(() => true),
      recents: () => this.recentList,
      onOpenPath: (path) => void this.open(path),
    });

    app.on('before-quit', () => {
      this.quitting = true;
    });
    app.on('will-quit', () => this.servers.killAll());

    this.refreshMenu();
  }

  /** Opens a folder or file (§4.2). Resolves once the window shows it, or the error is shown. */
  open(path: string, options: { newWindow?: boolean } = {}): Promise<void> {
    const run = this.queue.then(() => this.openNow(path, options.newWindow === true));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Launch with no path: reopen the windows that were open at quit, or the start screen. */
  async restoreSession(): Promise<void> {
    const missing: string[] = [];
    for (const entry of this.windowsFile.session) {
      if (!existsSync(entry.root)) {
        missing.push(entry.root);
        continue;
      }
      try {
        const record = await this.createSite(entry.root);
        void record.window.loadURL(`${record.origin}${entry.path}`);
      } catch (error) {
        this.showError(`Could not reopen ${entry.root}.`, error);
      }
    }
    if (missing.length > 0) {
      void dialog.showMessageBox({
        type: 'warning',
        message: missing.length === 1 ? 'A folder from your last session is gone.' : 'Folders from your last session are gone.',
        detail: missing.join('\n'),
      });
    }
    if (this.records.size === 0) this.newWindow();
  }

  /** File > New Window: a start screen. */
  newWindow(): void {
    createStartWindow({ recents: () => this.recentList, onOpenPath: (path) => void this.open(path) });
  }

  /** Focuses some window, or opens the start screen when there is none. */
  focusOrStart(): void {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (window === undefined) this.newWindow();
    else {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  }

  async showOpenFile(parent?: BrowserWindow): Promise<boolean> {
    const options: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], filters: [MARKDOWN_FILTER] };
    const result = parent === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(parent, options);
    for (const path of result.filePaths) await this.open(path);
    return result.filePaths.length > 0;
  }

  async showOpenFolder(parent?: BrowserWindow): Promise<boolean> {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] };
    const result = parent === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(parent, options);
    const [path] = result.filePaths;
    if (path !== undefined) await this.open(path, { newWindow: false });
    return path !== undefined;
  }

  /** File > Duplicate Window: a second window on the same root and server. */
  async duplicate(window: BrowserWindow): Promise<void> {
    const record = this.records.get(window.id);
    if (record === undefined) return;
    try {
      const copy = await this.createSite(record.root);
      void copy.window.loadURL(`${copy.origin}${record.lastPath}`);
    } catch (error) {
      this.showError(`Could not open another window on ${record.root}.`, error);
    }
  }

  clearRecents(): void {
    this.recentList = [];
    writeJson(this.paths.recents, this.recentList);
    app.clearRecentDocuments();
    this.refreshMenu();
  }

  isSiteWindow(window: BrowserWindow | null | undefined): boolean {
    return window !== null && window !== undefined && this.records.has(window.id);
  }

  private async openNow(input: string, newWindow: boolean): Promise<void> {
    const path = canonicalise(resolve(input));
    if (!existsSync(path)) {
      this.showError(`${input} does not exist.`);
      return;
    }

    const target = resolveTarget(path, {
      openRoots: this.windows.roots(),
      home: canonicalise(homedir()),
      isDirectory: (candidate) => statSync(candidate).isDirectory(),
      hasConfig: hasSeemoreConfig,
    });
    this.remember({ path, kind: target.kind });

    const existing = newWindow ? undefined : this.windows.windows(target.root)[0];
    let record = existing === undefined ? undefined : this.records.get(existing);
    const fresh = record === undefined;
    if (record === undefined) {
      try {
        record = await this.createSite(target.root);
      } catch (error) {
        this.showError(`Could not open ${target.root}.`, error);
        return;
      }
    } else {
      if (record.window.isMinimized()) record.window.restore();
      record.window.focus();
    }

    if (target.kind === 'folder') {
      if (fresh) await loadQuietly(record.window, `${record.origin}/`);
      return;
    }

    const route = await this.routeFor(record, target.file);
    if (route.ok) {
      await loadQuietly(record.window, `${record.origin}${route.url}`);
      return;
    }
    if (fresh) await loadQuietly(record.window, `${record.origin}/`);
    const { response } = await dialog.showMessageBox(record.window, {
      type: 'info',
      message: `${basename(target.file)} isn't part of this site.`,
      detail: route.reason,
      buttons: ['Open Containing Folder as a Site', 'OK'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) await this.openNow(dirname(target.file), true);
  }

  private async routeFor(record: SiteRecord, file: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
    try {
      const res = await fetch(`${record.origin}/__seemore/route?file=${encodeURIComponent(file)}`);
      const body = (await res.json()) as { url?: string; error?: string };
      if (res.ok && typeof body.url === 'string') return { ok: true, url: body.url };
      return { ok: false, reason: body.error ?? `The server answered ${res.status}.` };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** A window on `root`, with a lease on its server. The caller loads the first page. */
  private async createSite(root: string): Promise<SiteRecord> {
    this.checkCliOnce();
    const lease = await this.servers.acquire(root);
    console.log(`seemore: ${root} at ${lease.server.origin}`);

    const record: SiteRecord = {
      window: undefined as never,
      root,
      lease,
      origin: lease.server.origin,
      lastPath: '/',
      rootGoneReported: false,
    };
    record.window = createSiteWindow({
      root,
      bounds: this.windowsFile.bounds[root],
      origin: () => record.origin,
      onOpenPath: (path) => void this.open(path, { newWindow: true }),
    });
    const id = record.window.id;
    this.records.set(id, record);
    this.windows.add(id, root);

    const track = (url: string) => {
      if (record.origin !== undefined && url.startsWith(record.origin)) {
        const parsed = new URL(url);
        record.lastPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      this.checkRootStillThere(record);
      this.saveSession();
    };
    record.window.webContents.on('did-navigate', (_event, url) => track(url));
    record.window.webContents.on('did-navigate-in-page', (_event, url) => track(url));

    record.window.on('close', () => {
      this.windowsFile.bounds[root] = { ...record.window.getNormalBounds(), maximized: record.window.isMaximized() };
    });
    record.window.once('closed', () => {
      record.lease?.release();
      // The last window closing on Windows or Linux quits the app; it still belongs to the
      // session, so it is kept, as are windows closed by quitting.
      const keep = this.quitting || (process.platform !== 'darwin' && this.records.size === 1);
      this.records.delete(id);
      this.windows.remove(id);
      if (!keep) this.saveSession();
      else writeJson(this.paths.windows, this.windowsFile);
    });

    this.saveSession();
    this.noticeManyServers();
    return record;
  }

  private onServerCrash(root: string, stderr: string): void {
    for (const id of this.windows.windows(root)) {
      const record = this.records.get(id);
      if (record === undefined) continue;
      record.lease = undefined;
      record.origin = undefined;
      void record.window.loadFile(join(__dirname, 'error.html'));
      void dialog
        .showMessageBox(record.window, {
          type: 'error',
          message: `The seemore server for ${basename(root)} stopped.`,
          detail: stderr.trim() === '' ? 'It printed nothing before stopping.' : stderr.trim().slice(-4000),
          buttons: ['Restart', 'Close Window'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => (response === 0 ? this.restart(record) : record.window.close()));
    }
  }

  private async restart(record: SiteRecord): Promise<void> {
    try {
      record.lease = await this.servers.acquire(record.root);
      record.origin = record.lease.server.origin;
      await loadQuietly(record.window, `${record.origin}${record.lastPath}`);
    } catch (error) {
      this.showError(`Could not restart the server for ${record.root}.`, error);
    }
  }

  /** §16: a root deleted or renamed while open is noticed on the next navigation. */
  private checkRootStillThere(record: SiteRecord): void {
    if (record.rootGoneReported || existsSync(record.root)) return;
    record.rootGoneReported = true;
    void dialog
      .showMessageBox(record.window, {
        type: 'warning',
        message: `${record.root} no longer exists.`,
        detail: 'It was moved, renamed or deleted while open.',
        buttons: ['Close', 'Open…'],
        defaultId: 0,
      })
      .then(async ({ response }) => {
        if (response === 1) await this.showOpenFolder(record.window);
        if (!record.window.isDestroyed()) record.window.close();
      });
  }

  /** §6: checked once, before the first server starts; a mismatch means a broken install. */
  private checkCliOnce(): void {
    if (this.cliChecked) return;
    const check = checkCliVersion(readCliVersion(cliPackageJson()), pkg.seemore.minCliVersion);
    if (!check.ok) {
      const hint = app.isPackaged ? '' : ' Run `pnpm --filter seemore-desktop stage` to stage it.';
      throw new Error(`${check.message}${hint}`);
    }
    this.cliChecked = true;
  }

  private noticeManyServers(): void {
    if (this.state.manyServersNoticeShown === true || this.servers.roots().length < MANY_SERVERS) return;
    this.state.manyServersNoticeShown = true;
    writeJson(this.paths.state, this.state);
    void dialog.showMessageBox({
      type: 'info',
      message: 'Each open site runs its own server.',
      detail: 'Every open folder uses its own memory. Closing a window frees its site’s server after 30 seconds.',
    });
  }

  private remember(entry: RecentEntry): void {
    this.recentList = addRecent(this.recentList, entry);
    writeJson(this.paths.recents, this.recentList);
    app.addRecentDocument(entry.path);
    this.refreshMenu();
  }

  private saveSession(): void {
    this.windowsFile.session = [...this.records.values()].map((record) => ({ root: record.root, path: record.lastPath }));
    writeJson(this.paths.windows, this.windowsFile);
  }

  private refreshMenu(): void {
    buildMenu(this, this.recentList);
  }

  private showError(message: string, error?: unknown): void {
    void dialog.showMessageBox({
      type: 'error',
      message,
      detail: error === undefined ? undefined : error instanceof Error ? error.message : String(error),
    });
  }
}

/** Loads a URL; an aborted load (the user navigated on) is not an error worth reporting. */
async function loadQuietly(window: BrowserWindow, url: string): Promise<void> {
  try {
    await window.loadURL(url);
  } catch {
    // ERR_ABORTED and friends: the window shows whatever replaced it.
  }
}

function parseWindowsFile(value: unknown): WindowsFile {
  const file = (typeof value === 'object' && value !== null ? value : {}) as Partial<WindowsFile>;
  return {
    bounds: typeof file.bounds === 'object' && file.bounds !== null ? file.bounds : {},
    session: Array.isArray(file.session)
      ? file.session.filter(
          (entry): entry is { root: string; path: string } =>
            typeof entry?.root === 'string' && typeof entry.path === 'string' && entry.path.startsWith('/'),
        )
      : [],
  };
}
