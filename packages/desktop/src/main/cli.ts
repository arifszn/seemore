/**
 * Where the bundled seemore CLI lives: `resources/seemore/` in a packaged app (DESKTOP-SPEC
 * §9), and the staging directory from `pnpm stage` when running from source.
 */
import { join } from 'node:path';
import { app } from 'electron';

function seemoreDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'seemore', 'node_modules', 'seemore')
    : join(app.getAppPath(), 'build', 'stage', 'seemore', 'node_modules', 'seemore');
}

export function cliEntry(): string {
  return join(seemoreDir(), 'dist', 'cli', 'index.js');
}

export function cliPackageJson(): string {
  return join(seemoreDir(), 'package.json');
}
