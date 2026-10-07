/**
 * One seemore dev server per open root (DESKTOP-SPEC §6), shared by every window on it.
 *
 * Spawning is injected: the app passes `utilityProcess.fork`, the tests a fake. Windows hold
 * leases; when the last lease on a root is released, a grace timer runs before the process is
 * killed, so closing and reopening a folder skips the boot.
 */
import { createInterface } from 'node:readline';
import { DEV_READY_TIMEOUT_MS, parseReadyLine, type DevReady } from '@seemore/host';

/** The slice of Electron's `UtilityProcess` the registry uses. */
export interface ServerProcess {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(): boolean;
  on(event: 'exit', listener: (code: number) => void): unknown;
}

export interface Server {
  root: string;
  ready: DevReady;
  /** `http://localhost:<port>`, the only origin the server's windows may navigate within. */
  origin: string;
}

export interface Lease {
  server: Server;
  /** Idempotent; a lease on a server that has since crashed releases nothing. */
  release(): void;
}

export interface ServerRegistryOptions {
  fork: (root: string) => ServerProcess;
  graceMs?: number;
  readyTimeoutMs?: number;
  /** A server that was ready exited without being asked to. `stderr` is its recent output. */
  onCrash?: (root: string, stderr: string) => void;
}

/** Enough of a crashed server's stderr to show what went wrong, not its whole session. */
const STDERR_TAIL_BYTES = 16 * 1024;

interface Entry {
  root: string;
  process: ServerProcess;
  ready: Promise<Server>;
  refCount: number;
  graceTimer?: ReturnType<typeof setTimeout>;
  stderr: string;
  stopping: boolean;
}

export class ServerStartError extends Error {}

export class ServerRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly graceMs: number;
  private readonly readyTimeoutMs: number;

  constructor(private readonly options: ServerRegistryOptions) {
    this.graceMs = options.graceMs ?? 30_000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEV_READY_TIMEOUT_MS;
  }

  /** A lease on the server for `root`, starting one if none is running. */
  async acquire(root: string): Promise<Lease> {
    const entry = this.entries.get(root) ?? this.start(root);
    entry.refCount += 1;
    if (entry.graceTimer !== undefined) {
      clearTimeout(entry.graceTimer);
      entry.graceTimer = undefined;
    }

    let server: Server;
    try {
      server = await entry.ready;
    } catch (error) {
      entry.refCount -= 1;
      throw error;
    }

    let released = false;
    return {
      server,
      release: () => {
        if (released) return;
        released = true;
        this.release(entry);
      },
    };
  }

  /** Roots with a server running or starting. */
  roots(): string[] {
    return [...this.entries.keys()];
  }

  /** Kills every server now. For quitting. */
  killAll(): void {
    for (const entry of this.entries.values()) this.stop(entry);
  }

  private release(entry: Entry): void {
    if (this.entries.get(entry.root) !== entry) return;
    entry.refCount -= 1;
    if (entry.refCount > 0) return;
    entry.graceTimer = setTimeout(() => this.stop(entry), this.graceMs);
  }

  private stop(entry: Entry): void {
    if (entry.graceTimer !== undefined) clearTimeout(entry.graceTimer);
    entry.stopping = true;
    if (this.entries.get(entry.root) === entry) this.entries.delete(entry.root);
    entry.process.kill();
  }

  private start(root: string): Entry {
    const child = this.options.fork(root);
    const entry: Entry = { root, process: child, refCount: 0, stderr: '', stopping: false, ready: undefined as never };
    this.entries.set(root, entry);

    // Both streams are read for the server's whole life: Vite logs a line per save, and an
    // unread pipe eventually blocks the child (§6).
    child.stderr?.on('data', (chunk: Buffer | string) => {
      entry.stderr = (entry.stderr + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });

    entry.ready = new Promise<Server>((resolvePromise, reject) => {
      let settled = false;
      const lines = child.stdout === null ? undefined : createInterface({ input: child.stdout });

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        lines?.close();
        child.stdout?.resume();
        fn();
      };

      const fail = (message: string) =>
        settle(() => {
          this.stop(entry);
          reject(new ServerStartError(message));
        });

      const timer = setTimeout(
        () => fail(`seemore did not report readiness within ${this.readyTimeoutMs / 1000} s.`),
        this.readyTimeoutMs,
      );

      lines?.on('line', (line) => {
        const ready = parseReadyLine(line);
        if (ready === undefined) return;
        settle(() => resolvePromise({ root, ready, origin: new URL(ready.url).origin }));
      });

      child.on('exit', (code) => {
        if (!settled) {
          fail(`seemore exited before it was ready (code ${code}).${entry.stderr === '' ? '' : `\n\n${entry.stderr}`}`);
          return;
        }
        if (entry.stopping) return;
        if (this.entries.get(root) === entry) this.entries.delete(root);
        this.options.onCrash?.(root, entry.stderr);
      });
    });
    // Rejections reach every caller through `acquire`; this only stops an unhandled warning
    // when a server fails between two acquires.
    entry.ready.catch(() => undefined);

    return entry;
  }
}
