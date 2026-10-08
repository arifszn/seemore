/**
 * The shells of a terminal panel (DESKTOP-SPEC §7.4): `node-pty` in the main process, at the
 * site root. Which shell and environment are pure functions, tested per platform; `Shells`
 * holds one window's processes.
 */
import { existsSync } from 'node:fs';
import { basename, win32 } from 'node:path';
import type { IPty } from 'node-pty';

export interface ShellCommand {
  file: string;
  args: string[];
}

/**
 * `$SHELL` as a login shell on macOS and Linux, so an app started from Finder or a launcher
 * gets the user's `PATH`; PowerShell, else `%ComSpec%`, on Windows.
 */
export function shellFor(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean = existsSync,
): ShellCommand {
  if (platform === 'win32') {
    const powershell = win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (exists(powershell)) return { file: powershell, args: [] };
    return { file: env.ComSpec ?? 'cmd.exe', args: [] };
  }
  const shell = env.SHELL;
  const file = shell !== undefined && shell !== '' && exists(shell) ? shell : platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  return { file, args: ['-l'] };
}

/** The app's environment without Electron's own variables, as a terminal expects it. */
export function shellEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith('ELECTRON_')) out[key] = value;
  }
  out.TERM = 'xterm-256color';
  out.COLORTERM = 'truecolor';
  return out;
}

/** The shell's name for the tabs list: `zsh`, `powershell`, `cmd`. */
export function shellName(file: string): string {
  return (file.includes('\\') ? win32.basename(file) : basename(file)).replace(/\.exe$/i, '');
}

/** A terminal size from the page: whole cells, within reason. */
export function validSize(cols: unknown, rows: unknown): { cols: number; rows: number } | undefined {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1000;
  return ok(cols) && ok(rows) ? { cols, rows } : undefined;
}

export interface ShellInfo {
  id: number;
  name: string;
}

export interface ShellEvents {
  onData: (id: number, data: string) => void;
  onExit: (id: number, exitCode: number) => void;
}

type Spawn = (file: string, args: string[], options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }) => IPty;

/** One window's shells, keyed by terminal id. */
export class Shells {
  private readonly ptys = new Map<number, { pty: IPty; name: string }>();
  private nextId = 1;

  constructor(
    private readonly cwd: string,
    private readonly events: ShellEvents,
    private readonly spawn: Spawn,
  ) {}

  get size(): number {
    return this.ptys.size;
  }

  /** Process ids, for tests and diagnostics. */
  pids(): number[] {
    return [...this.ptys.values()].map(({ pty }) => pty.pid);
  }

  list(): ShellInfo[] {
    return [...this.ptys].map(([id, { name }]) => ({ id, name }));
  }

  create(cols: number, rows: number): ShellInfo {
    const command = shellFor(process.platform, process.env);
    const pty = this.spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.cwd,
      env: shellEnv(process.env),
    });
    const id = this.nextId++;
    const name = shellName(command.file);
    this.ptys.set(id, { pty, name });
    pty.onData((data) => this.events.onData(id, data));
    pty.onExit(({ exitCode }) => {
      if (!this.ptys.delete(id)) return;
      this.events.onExit(id, exitCode);
    });
    return { id, name };
  }

  write(id: number, data: string): void {
    this.ptys.get(id)?.pty.write(data);
  }

  resize(id: number, cols: number, rows: number): void {
    try {
      this.ptys.get(id)?.pty.resize(cols, rows);
    } catch {
      // A shell exiting as the panel resizes: its exit event follows.
    }
  }

  rename(id: number, name: string): boolean {
    const entry = this.ptys.get(id);
    if (entry === undefined) return false;
    entry.name = name;
    return true;
  }

  /** Kills one shell; its exit event removes it. */
  kill(id: number): void {
    this.ptys.get(id)?.pty.kill();
  }

  /** The window is closing: every shell goes, with no exit events. */
  killAll(): void {
    const ptys = [...this.ptys.values()];
    this.ptys.clear();
    for (const { pty } of ptys) {
      try {
        pty.kill();
      } catch {
        // Already gone.
      }
    }
  }
}
