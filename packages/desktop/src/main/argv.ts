/**
 * Paths named on a command line: the first launch's `process.argv`, or a second instance's
 * argv handed over through `second-instance`. Resolved against that process's own working
 * directory, which `second-instance` passes along; the primary instance's cwd differs.
 */
import { isAbsolute, resolve } from 'node:path';

export function pathsFromArgv(argv: readonly string[], cwd: string, isPackaged: boolean): string[] {
  return (
    argv
      // Chromium and Electron add switches of their own (`--allow-file-access-from-files`,
      // macOS's legacy `-psn_…`), and in a second instance's argv some come before the app
      // directory, so they go first, before anything is skipped by position.
      .filter((arg) => arg !== '' && !arg.startsWith('-'))
      // The executable; unpackaged, also the app directory (`electron .`).
      .slice(isPackaged ? 1 : 2)
      .map((arg) => (isAbsolute(arg) ? arg : resolve(cwd, arg)))
  );
}
