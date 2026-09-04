/**
 * Spawns the bundled `seemore` CLI as a child process and waits for its JSON ready line.
 * One child per window: the panel is a singleton, so there is never more than one of these
 * live at a time.
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

export interface DevReady {
  url: string;
  port: number;
  contentRoot: string;
  pageCount: number;
}

/**
 * `seemore --json`'s ready line is the only stdout this reads structurally; anything else
 * (a warning, a stray log from a dependency) is just not that line. Validated by shape, not
 * merely "is it JSON", so a truncated or unrelated line can't be mistaken for readiness.
 */
export function parseReadyLine(line: string): DevReady | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.url !== 'string') return undefined;
  if (typeof candidate.port !== 'number') return undefined;
  if (typeof candidate.contentRoot !== 'string') return undefined;
  if (typeof candidate.pageCount !== 'number') return undefined;

  return {
    url: candidate.url,
    port: candidate.port,
    contentRoot: candidate.contentRoot,
    pageCount: candidate.pageCount,
  };
}

/** `--port 0` always: the OS assigns an ephemeral port, so nothing can collide. */
export function buildDevArgs(root: string): string[] {
  return [root, '--port', '0', '--no-open', '--json'];
}

/**
 * A CLI too old to know `--json` never prints a line {@link parseReadyLine} accepts. This
 * timeout is how that surfaces as a real error instead of a permanently blank panel.
 */
export const DEV_READY_TIMEOUT_MS = 15_000;

export class DevServerStartError extends Error {}

export interface SpawnedDevServer {
  process: ChildProcessByStdio<null, Readable, Readable>;
  ready: DevReady;
}

export interface SpawnDevServerOptions {
  /** Absolute path to the CLI entry, e.g. `<ext>/node_modules/seemore/dist/cli/index.js`. */
  cliEntry: string;
  /** The resolved content root to serve. */
  root: string;
  timeoutMs?: number;
}

/**
 * Spawns `node <cliEntry> <root> --port 0 --no-open --json` and resolves once its ready
 * line arrives. Rejects — never hangs — if the process exits first or takes too long, so a
 * stale or incompatible CLI surfaces as a real error instead of a permanently blank panel.
 */
export function spawnDevServer(options: SpawnDevServerOptions): Promise<SpawnedDevServer> {
  const { cliEntry, root, timeoutMs = DEV_READY_TIMEOUT_MS } = options;
  const child = spawn(process.execPath, [cliEntry, ...buildDevArgs(root)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const stderr: string[] = [];

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      // Readiness is the last output this module reads. The server keeps logging for its
      // whole lifetime (vite prints a line for every markdown save), and a detached
      // readline leaves stdout paused — the pipe would fill until the child blocks on
      // write. Drain stdout from here on, and drop the stderr accumulator with it: it only
      // feeds the not-ready exit message below, which by definition runs before this.
      child.stdout.resume();
      child.stderr.removeAllListeners();
      child.stderr.resume();
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(
          new DevServerStartError(
            `seemore did not report readiness within ${timeoutMs}ms. The bundled CLI may be older than this extension requires — try updating seemore.`,
          ),
        );
      });
    }, timeoutMs);

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const ready = parseReadyLine(line);
      if (ready === undefined) return;
      settle(() => resolvePromise({ process: child, ready }));
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk.toString('utf8'));
    });

    child.on('error', (error) => {
      settle(() => reject(new DevServerStartError(`Failed to start seemore: ${error.message}`)));
    });

    child.on('exit', (code) => {
      settle(() =>
        reject(
          new DevServerStartError(
            `seemore exited before it was ready (code ${code ?? 'unknown'}).${
              stderr.length > 0 ? `\n${stderr.join('')}` : ''
            }`,
          ),
        ),
      );
    });
  });
}
