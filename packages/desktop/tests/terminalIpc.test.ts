/**
 * The terminal IPC's sender check (DESKTOP-SPEC §8): every handler answers only a terminal
 * view, and only about its own window's shells. Electron and node-pty are fakes here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  let nextId = 100;
  class WebContentsView {
    /** The bounds and visibility `layout()` set, and what the page was sent. */
    bounds = { x: 0, y: 0, width: 0, height: 0 };
    visible = true;
    sent: unknown[][] = [];
    webContents = {
      id: nextId++,
      on: () => undefined,
      once: (_name: string, fn: () => void) => fn(),
      setWindowOpenHandler: () => undefined,
      loadFile: () => Promise.resolve(),
      isDestroyed: () => false,
      send: (...args: unknown[]) => void this.sent.push(args),
      focus: () => undefined,
      close: () => undefined,
    };
    setBackgroundColor() {}
    setBounds(bounds: { x: number; y: number; width: number; height: number }) {
      this.bounds = bounds;
    }
    setVisible(visible: boolean) {
      this.visible = visible;
    }
  }
  return {
    handlers,
    WebContentsView,
    clipboard: { writeText: vi.fn() },
    shell: { openExternal: vi.fn(() => Promise.resolve()) },
    ipcMain: {
      on: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler as never),
      handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler as never),
    },
    nativeTheme: { shouldUseDarkColors: false },
    dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })) },
  };
});
vi.mock('electron', () => electron);

/** Every folder exists but this one. */
vi.mock('node:fs', async (original) => ({ ...(await original<typeof import('node:fs')>()), existsSync: (path: string) => path !== '/sites/gone' }));

const ptys = vi.hoisted(() => [] as { write: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; exit: (code: number) => void }[]);
const pty = vi.hoisted(() => ({
  spawn: vi.fn(() => {
    let onExit: (event: { exitCode: number }) => void = () => undefined;
    const fake = {
      pid: 1,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: () => ({ dispose() {} }),
      onExit: (listener: typeof onExit) => {
        onExit = listener;
        return { dispose() {} };
      },
      exit: (exitCode: number) => onExit({ exitCode }),
    };
    ptys.push(fake);
    return fake;
  }),
}));
vi.mock('node-pty', () => pty);

const { registerTerminalHandlers, TerminalPanel } = await import('../src/main/terminalPanel.js');
registerTerminalHandlers();

/** A terminal view fake: what `layout()` set, and what the page was sent. */
interface FakeView {
  webContents: { id: number };
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
  sent: unknown[][];
}

/** An open panel and the id of its terminal view's `webContents`. */
function openPanel(root = '/sites/docs') {
  const views: FakeView[] = [];
  let destroyed = false;
  const onChange = vi.fn();
  const window = {
    on: () => undefined,
    once: () => undefined,
    isDestroyed: () => destroyed,
    getContentBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    contentView: { on: () => undefined, addChildView: (view: FakeView) => void views.push(view) },
  };
  const siteBounds: { x: number; y: number; width: number; height: number }[] = [];
  const siteVisible: boolean[] = [];
  const site = {
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void siteBounds.push({ ...bounds }),
    setVisible: (visible: boolean) => void siteVisible.push(visible),
    webContents: { focus: () => undefined },
  };
  const panel = new TerminalPanel(window as never, site as never, root, { height: 280, open: true }, onChange);
  return {
    panel,
    onChange,
    sender: { id: views[0]!.webContents.id },
    view: views[0]!,
    siteBounds,
    siteVisible,
    destroy: () => (destroyed = true),
  };
}

const call = (channel: string, sender: { id: number }, ...args: unknown[]) => electron.handlers.get(channel)!({ sender }, ...args);

describe('terminal IPC', () => {
  beforeEach(() => {
    ptys.length = 0;
    vi.clearAllMocks();
  });

  it('starts a shell for a terminal view', () => {
    const { panel, sender } = openPanel();
    expect(call('terminal:create', sender, 80, 24)).toMatchObject({ id: 1 });
    expect(panel.shells.size).toBe(1);
  });

  it('answers nothing for any other sender, such as a site page', () => {
    const { panel, view } = openPanel();
    const site = { id: 1 };
    expect(call('terminal:create', site, 80, 24)).toBeUndefined();
    call('terminal:input', site, 1, 'rm -rf ~\r');
    call('terminal:copy', site, 'text');
    call('terminal:paste', site);
    call('terminal:openLink', site, 'https://example.com/');
    call('terminal:hide', site);
    call('terminal:maximize', site);
    expect(panel.shells.size).toBe(0);
    expect(ptys).toHaveLength(0);
    expect(electron.clipboard.writeText).not.toHaveBeenCalled();
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
    expect(panel.isOpen).toBe(true);
    expect(view.bounds).toEqual({ x: 0, y: 520, width: 1000, height: 280 });
  });

  it('keeps each window to its own shells, though their ids match', () => {
    const a = openPanel();
    const b = openPanel();
    call('terminal:create', a.sender, 80, 24);
    call('terminal:create', b.sender, 80, 24);
    call('terminal:input', b.sender, 1, 'ls\r');
    expect(ptys[0]!.write).not.toHaveBeenCalled();
    expect(ptys[1]!.write).toHaveBeenCalledWith('ls\r');
    call('terminal:kill', b.sender, 1);
    expect(ptys[0]!.kill).not.toHaveBeenCalled();
  });

  it('rejects malformed arguments from a terminal view', () => {
    const { panel, sender } = openPanel();
    expect(call('terminal:create', sender, '80', 24)).toBeUndefined();
    expect(call('terminal:create', sender, 0, 24)).toBeUndefined();
    call('terminal:create', sender, 80, 24);
    call('terminal:input', sender, '1', 'ls\r');
    call('terminal:input', sender, 1, 42);
    expect(ptys[0]!.write).not.toHaveBeenCalled();
    expect(panel.shells.size).toBe(1);
  });

  it('starts no shell, and says why, when the shell fails to spawn', () => {
    const { panel, sender } = openPanel();
    pty.spawn.mockImplementationOnce(() => {
      throw new Error('File not found: /nope/sh');
    });
    expect(call('terminal:create', sender, 80, 24)).toBeUndefined();
    expect(panel.shells.size).toBe(0);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Could not start a shell.', detail: 'File not found: /nope/sh' }),
    );
  });

  it('starts no shell in a folder that has gone', () => {
    const { panel, sender } = openPanel('/sites/gone');
    expect(call('terminal:create', sender, 80, 24)).toBeUndefined();
    expect(pty.spawn).not.toHaveBeenCalled();
    expect(panel.shells.size).toBe(0);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail: '/sites/gone no longer exists.' }));
  });

  it('leaves a destroyed window alone when its last shell exits', () => {
    const { panel, onChange, sender, destroy } = openPanel();
    call('terminal:create', sender, 80, 24);
    destroy();
    expect(() => ptys[0]!.exit(0)).not.toThrow();
    expect(panel.isOpen).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens only web and mail links', () => {
    const { sender } = openPanel();
    call('terminal:openLink', sender, 'file:///etc/passwd');
    call('terminal:openLink', sender, 'javascript:alert(1)');
    call('terminal:openLink', sender, 'https://example.com/docs');
    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1);
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('maximizes the panel for a terminal view, and restores it', () => {
    const { sender, view, siteBounds, siteVisible } = openPanel();
    call('terminal:maximize', sender);
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(view.sent).toContainEqual(['terminal:command', 'maximized']);
    // The site hides rather than shrinking to nothing; its bounds wait for the restore.
    expect(siteVisible.at(-1)).toBe(false);
    expect(siteBounds.length).toBe(1);
    call('terminal:maximize', sender);
    expect(view.bounds).toEqual({ x: 0, y: 520, width: 1000, height: 280 });
    expect(view.sent).toContainEqual(['terminal:command', 'restored']);
    expect(siteVisible.at(-1)).toBe(true);
    expect(siteBounds.at(-1)).toEqual({ x: 0, y: 0, width: 1000, height: 520 });
  });

  it('restores a maximized panel when the splitter is grabbed', () => {
    const { sender, view } = openPanel();
    call('terminal:maximize', sender);
    call('terminal:drag', sender, 'start', 500);
    // The grab itself restores the saved height (280), before any move.
    expect(view.bounds).toEqual({ x: 0, y: 520, width: 1000, height: 280 });
    expect(view.sent).toContainEqual(['terminal:command', 'restored']);
    call('terminal:drag', sender, 'move', 450);
    call('terminal:drag', sender, 'end', 400);
    expect(view.bounds).toEqual({ x: 0, y: 420, width: 1000, height: 380 });
  });

  it('resets a maximized panel when it is hidden', () => {
    const { panel, onChange, sender, view } = openPanel();
    call('terminal:maximize', sender);
    call('terminal:hide', sender);
    expect(panel.isOpen).toBe(false);
    expect(view.sent).toContainEqual(['terminal:command', 'restored']);
    panel.open();
    expect(view.bounds).toEqual({ x: 0, y: 520, width: 1000, height: 280 });
    expect(onChange).toHaveBeenLastCalledWith({ height: 280, open: true });
  });
});
