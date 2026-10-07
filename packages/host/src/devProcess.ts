/**
 * The contract between a host and the `seemore` dev server it starts: the arguments, and the
 * one JSON line the server prints once it is listening. Spawning itself stays with each host
 * (`child_process.spawn` in the extension, `utilityProcess.fork` in the desktop app); both
 * run the process with its `cwd` set to the root, because seemore adds `process.cwd()` to
 * Vite's `server.fs.allow`, and a host's own cwd can be `/`.
 */

export interface DevReady {
  url: string;
  port: number;
  contentRoot: string;
  pageCount: number;
}

/**
 * `seemore --json`'s ready line is the only stdout a host reads structurally; anything else
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
 * timeout is how that surfaces as a real error instead of a permanently blank view.
 */
export const DEV_READY_TIMEOUT_MS = 15_000;
