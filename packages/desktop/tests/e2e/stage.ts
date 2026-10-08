/**
 * Stages the CLI before the end-to-end run when it is missing or from another seemore
 * version. The app refuses a CLI whose version differs from the one it was built with, so a
 * stage left over from before a version bump fails every test at launch.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const desktopDir = join(import.meta.dirname, '..', '..');
const staged = join(desktopDir, 'build', 'stage', 'seemore', 'node_modules', 'seemore');

const versionOf = (packageJson: string) =>
  existsSync(packageJson) ? (JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string }).version : undefined;

export default function setup(): void {
  const expected = versionOf(join(desktopDir, '..', 'seemore', 'package.json'));
  const found = versionOf(join(staged, 'package.json'));
  if (found === expected && existsSync(join(staged, 'dist', 'cli', 'index.js'))) return;
  console.log(`seemore-desktop e2e: staged CLI is ${found ?? 'missing'}, expected ${expected}; staging...`);
  execFileSync(process.execPath, [join(desktopDir, 'scripts', 'stage-seemore.mjs')], { cwd: desktopDir, stdio: 'inherit' });
}
