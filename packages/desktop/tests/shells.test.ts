import type { IPty } from 'node-pty';
import { describe, expect, it, vi } from 'vitest';
import { shellEnv, shellFor, shellName, Shells, validSize } from '../src/main/shells.js';

describe('shellFor', () => {
  const all = () => true;
  const none = () => false;

  it('runs $SHELL as a login shell on macOS and Linux', () => {
    expect(shellFor('darwin', { SHELL: '/opt/homebrew/bin/fish' }, all)).toEqual({ file: '/opt/homebrew/bin/fish', args: ['-l'] });
    expect(shellFor('linux', { SHELL: '/usr/bin/zsh' }, all)).toEqual({ file: '/usr/bin/zsh', args: ['-l'] });
  });

  it('falls back to zsh on macOS and bash on Linux when $SHELL is unset or missing', () => {
    expect(shellFor('darwin', {}, all)).toEqual({ file: '/bin/zsh', args: ['-l'] });
    expect(shellFor('linux', { SHELL: '' }, all)).toEqual({ file: '/bin/bash', args: ['-l'] });
    expect(shellFor('linux', { SHELL: '/gone/shell' }, none)).toEqual({ file: '/bin/bash', args: ['-l'] });
  });

  it('runs PowerShell on Windows, else %ComSpec%', () => {
    const env = { SystemRoot: 'D:\\Win', ComSpec: 'D:\\Win\\System32\\cmd.exe' };
    expect(shellFor('win32', env, all)).toEqual({ file: 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: [] });
    expect(shellFor('win32', env, none)).toEqual({ file: 'D:\\Win\\System32\\cmd.exe', args: [] });
    expect(shellFor('win32', {}, none)).toEqual({ file: 'cmd.exe', args: [] });
  });
});

describe('shellEnv', () => {
  it('drops Electron’s variables and sets the terminal type', () => {
    const env = shellEnv({ PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1', TERM: 'dumb', UNSET: undefined });
    expect(env).toEqual({ PATH: '/bin', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  });
});

describe('shellName', () => {
  it('names the shell by its file', () => {
    expect(shellName('/bin/zsh')).toBe('zsh');
    expect(shellName('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell');
    expect(shellName('cmd.exe')).toBe('cmd');
  });
});

describe('validSize', () => {
  it('accepts whole cells within reason', () => {
    expect(validSize(80, 24)).toEqual({ cols: 80, rows: 24 });
    expect(validSize(0, 24)).toBeUndefined();
    expect(validSize(80.5, 24)).toBeUndefined();
    expect(validSize('80', 24)).toBeUndefined();
    expect(validSize(80, 5000)).toBeUndefined();
  });
});

function fakePty() {
  let onData: (data: string) => void = () => undefined;
  let onExit: (e: { exitCode: number }) => void = () => undefined;
  const pty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => onExit({ exitCode: 0 })),
    onData: (listener: typeof onData) => {
      onData = listener;
      return { dispose: () => undefined };
    },
    onExit: (listener: typeof onExit) => {
      onExit = listener;
      return { dispose: () => undefined };
    },
  };
  return { pty: pty as unknown as IPty, mock: pty, emit: (data: string) => onData(data), exit: (code: number) => onExit({ exitCode: code }) };
}

describe('Shells', () => {
  const setup = () => {
    const fakes: ReturnType<typeof fakePty>[] = [];
    const events = { onData: vi.fn(), onExit: vi.fn() };
    const spawn = vi.fn((_file: string, _args: string[], _options: { cwd: string; env: Record<string, string> }) => {
      const fake = fakePty();
      fakes.push(fake);
      return fake.pty;
    });
    return { shells: new Shells('/sites/docs', events, spawn), fakes, events, spawn };
  };

  it('starts each shell at the root, with its own id', () => {
    const { shells, spawn } = setup();
    const a = shells.create(80, 24);
    const b = shells.create(80, 24);
    expect(a.id).not.toBe(b.id);
    expect(spawn.mock.calls[0]![2].cwd).toBe('/sites/docs');
    expect(spawn.mock.calls[0]![2].env.TERM).toBe('xterm-256color');
    expect(shells.size).toBe(2);
  });

  it('routes data, input and resizes by id', () => {
    const { shells, fakes, events } = setup();
    const a = shells.create(80, 24);
    const b = shells.create(80, 24);
    fakes[1]!.emit('hello');
    expect(events.onData).toHaveBeenCalledWith(b.id, 'hello');
    shells.write(a.id, 'ls\r');
    shells.resize(b.id, 100, 30);
    expect(fakes[0]!.mock.write).toHaveBeenCalledWith('ls\r');
    expect(fakes[1]!.mock.resize).toHaveBeenCalledWith(100, 30);
    shells.write(99, 'ignored');
  });

  it('removes a shell that exits and reports it once', () => {
    const { shells, fakes, events } = setup();
    const a = shells.create(80, 24);
    fakes[0]!.exit(3);
    fakes[0]!.exit(3);
    expect(events.onExit).toHaveBeenCalledTimes(1);
    expect(events.onExit).toHaveBeenCalledWith(a.id, 3);
    expect(shells.size).toBe(0);
  });

  it('renames, and kills one through its exit', () => {
    const { shells, fakes, events } = setup();
    const a = shells.create(80, 24);
    expect(shells.rename(a.id, 'server')).toBe(true);
    expect(shells.list()).toEqual([{ id: a.id, name: 'server' }]);
    shells.kill(a.id);
    expect(fakes[0]!.mock.kill).toHaveBeenCalled();
    expect(events.onExit).toHaveBeenCalledWith(a.id, 0);
  });

  it('kills every shell on close, with no exit events', () => {
    const { shells, fakes, events } = setup();
    shells.create(80, 24);
    shells.create(80, 24);
    shells.killAll();
    expect(fakes.every((fake) => fake.mock.kill.mock.calls.length === 1)).toBe(true);
    expect(events.onExit).not.toHaveBeenCalled();
    expect(shells.size).toBe(0);
  });
});
