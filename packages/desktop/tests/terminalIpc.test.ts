/**
 * The terminal IPC's sender check (DESKTOP-SPEC §8): every handler answers only a terminal
 * view, and only about its own window's shells. Electron and node-pty are fakes here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  let nextId = 100;
  class WebContentsView {
    webContents = {
      id: nextId++,
      on: () => undefined,
      once: () => undefined,
      setWindowOpenHandler: () => undefined,
      loadFile: () => Promise.resolve(),
      isDestroyed: () => false,
      send: () => undefined,
      focus: () => undefined,
      close: () => undefined,
    };
    setBackgroundColor() {}
    setBounds() {}
    setVisible() {}
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
  };
});
vi.mock('electron', () => electron);

const ptys = vi.hoisted(() => [] as { write: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> }[]);
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const pty = { pid: 1, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) };
    ptys.push(pty);
    return pty;
  }),
}));

const { registerTerminalHandlers, TerminalPanel } = await import('../src/main/terminalPanel.js');
registerTerminalHandlers();

/** An open panel and the id of its terminal view's `webContents`. */
function openPanel() {
  const views: { webContents: { id: number } }[] = [];
  const window = {
    on: () => undefined,
    once: () => undefined,
    isDestroyed: () => false,
    getContentBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    contentView: { on: () => undefined, addChildView: (view: { webContents: { id: number } }) => void views.push(view) },
  };
  const site = { setBounds: () => undefined, webContents: { focus: () => undefined } };
  const panel = new TerminalPanel(window as never, site as never, '/sites/docs', { height: 280, open: true }, () => undefined);
  return { panel, sender: { id: views[0]!.webContents.id } };
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
    const { panel } = openPanel();
    const site = { id: 1 };
    expect(call('terminal:create', site, 80, 24)).toBeUndefined();
    call('terminal:input', site, 1, 'rm -rf ~\r');
    call('terminal:copy', site, 'text');
    call('terminal:paste', site);
    call('terminal:openLink', site, 'https://example.com/');
    call('terminal:hide', site);
    expect(panel.shells.size).toBe(0);
    expect(ptys).toHaveLength(0);
    expect(electron.clipboard.writeText).not.toHaveBeenCalled();
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
    expect(panel.isOpen).toBe(true);
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

  it('opens only web and mail links', () => {
    const { sender } = openPanel();
    call('terminal:openLink', sender, 'file:///etc/passwd');
    call('terminal:openLink', sender, 'javascript:alert(1)');
    call('terminal:openLink', sender, 'https://example.com/docs');
    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1);
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });
});
