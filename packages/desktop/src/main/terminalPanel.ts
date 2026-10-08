/**
 * The terminal panel of a site window (DESKTOP-SPEC §7.4): a second `WebContentsView` below
 * the site view, created on first use. The panel owns the window's layout: the site takes
 * what the panel leaves. Its page drags a splitter strip; the main process turns the drag
 * into bounds, so the page never sets its own size. Each panel holds its window's shells.
 * IPC is answered only for a terminal view, and only about its own window's shells (§8).
 */
import { join } from 'node:path';
import { type BrowserWindow, ipcMain, nativeTheme, type WebContents, WebContentsView } from 'electron';
import { spawn } from 'node-pty';
import { Shells, validSize } from './shells.js';

export interface PanelState {
  height: number;
  open: boolean;
}

export const DEFAULT_PANEL: PanelState = { height: 280, open: false };
/** The panel never shrinks below its header and a few lines. */
export const MIN_PANEL_HEIGHT = 120;
/** Nor does the site, so the splitter can always be grabbed back. */
export const MIN_SITE_HEIGHT = 160;

/** The panel height that fits a window content area `contentHeight` tall. */
export function clampPanelHeight(height: number, contentHeight: number): number {
  const max = Math.max(MIN_PANEL_HEIGHT, contentHeight - MIN_SITE_HEIGHT);
  return Math.round(Math.min(Math.max(height, MIN_PANEL_HEIGHT), max));
}

/** A saved panel state, or the default for anything malformed. */
export function parsePanelState(value: unknown): PanelState {
  const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PanelState>;
  return {
    height: typeof state.height === 'number' && Number.isFinite(state.height) ? state.height : DEFAULT_PANEL.height,
    open: state.open === true,
  };
}

/** Terminal views by `webContents` id: the only senders the handlers answer. */
const panels = new Map<number, TerminalPanel>();

const isId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id);

export function registerTerminalHandlers(): void {
  const from = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => panels.get(event.sender.id);

  ipcMain.on('terminal:drag', (event, phase: unknown, screenY: unknown) => {
    const panel = from(event);
    if (panel === undefined || typeof screenY !== 'number' || !Number.isFinite(screenY)) return;
    if (phase === 'start' || phase === 'move' || phase === 'end') panel.drag(phase, screenY);
  });
  ipcMain.handle('terminal:create', (event, cols: unknown, rows: unknown) => {
    const size = validSize(cols, rows);
    return size === undefined ? undefined : from(event)?.shells.create(size.cols, size.rows);
  });
  ipcMain.on('terminal:input', (event, id: unknown, data: unknown) => {
    if (isId(id) && typeof data === 'string') from(event)?.shells.write(id, data);
  });
  ipcMain.on('terminal:resize', (event, id: unknown, cols: unknown, rows: unknown) => {
    const size = validSize(cols, rows);
    if (isId(id) && size !== undefined) from(event)?.shells.resize(id, size.cols, size.rows);
  });
  ipcMain.on('terminal:rename', (event, id: unknown, name: unknown) => {
    if (isId(id) && typeof name === 'string' && name.trim() !== '') from(event)?.shells.rename(id, name.trim().slice(0, 100));
  });
  ipcMain.on('terminal:kill', (event, id: unknown) => {
    if (isId(id)) from(event)?.shells.kill(id);
  });
}

export class TerminalPanel {
  private view: WebContentsView | undefined;
  /** Kept: `view.webContents` reads undefined once the window destroys the view. */
  private page: WebContents | undefined;
  private state: PanelState;
  private dragFrom: { screenY: number; height: number } | undefined;
  readonly shells: Shells;

  constructor(
    private readonly window: BrowserWindow,
    private readonly site: WebContentsView,
    root: string,
    saved: PanelState,
    private readonly onChange: (state: PanelState) => void,
  ) {
    this.state = { ...saved };
    this.shells = new Shells(
      root,
      {
        onData: (id, data) => this.send('terminal:data', id, data),
        onExit: (id, exitCode) => {
          this.send('terminal:exit', id, exitCode);
          // The last shell to exit hides the panel.
          if (this.shells.size === 0) this.close();
        },
      },
      spawn,
    );
    window.on('resize', () => this.layout());
    // Closing the window, Close Folder and quitting all close it.
    window.once('closed', () => {
      this.shells.killAll();
      if (this.page === undefined) return;
      panels.delete(this.page.id);
      if (!this.page.isDestroyed()) this.page.close();
    });
    if (this.state.open) this.ensureView();
    this.layout();
  }

  get isOpen(): boolean {
    return this.state.open;
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  open(): void {
    this.ensureView();
    this.state.open = true;
    this.layout();
    this.page?.focus();
    this.onChange({ ...this.state });
  }

  close(): void {
    if (!this.state.open) return;
    this.state.open = false;
    this.layout();
    this.site.webContents.focus();
    this.onChange({ ...this.state });
  }

  /** Sets both views' bounds from the window's content size and the panel state. */
  layout(): void {
    if (this.window.isDestroyed()) return;
    const { width, height } = this.window.getContentBounds();
    const panel = this.state.open ? clampPanelHeight(this.state.height, height) : 0;
    this.site.setBounds({ x: 0, y: 0, width, height: height - panel });
    if (this.view === undefined) return;
    this.view.setVisible(this.state.open);
    if (this.state.open) this.view.setBounds({ x: 0, y: height - panel, width, height: panel });
  }

  /** A splitter drag from the page, in screen coordinates: stable while the view moves. */
  drag(phase: 'start' | 'move' | 'end', screenY: number): void {
    if (!this.state.open) return;
    const { height } = this.window.getContentBounds();
    if (phase === 'start') {
      this.dragFrom = { screenY, height: clampPanelHeight(this.state.height, height) };
      return;
    }
    if (this.dragFrom === undefined) return;
    this.state.height = clampPanelHeight(this.dragFrom.height - (screenY - this.dragFrom.screenY), height);
    this.layout();
    if (phase === 'end') {
      this.dragFrom = undefined;
      this.onChange({ ...this.state });
    }
  }

  private send(channel: string, ...args: unknown[]): void {
    if (this.page !== undefined && !this.page.isDestroyed()) this.page.send(channel, ...args);
  }

  private ensureView(): void {
    if (this.view !== undefined) return;
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, 'preload-terminal.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff');
    const page = view.webContents;
    page.on('will-navigate', (details) => details.preventDefault());
    page.setWindowOpenHandler(() => ({ action: 'deny' }));
    panels.set(page.id, this);
    this.view = view;
    this.page = page;
    // Above the site view; the Opening overlay (§5), added later, still covers both.
    this.window.contentView.addChildView(view);
    void page.loadFile(join(__dirname, 'terminal.html')).catch(() => undefined);
  }
}
