#!/usr/bin/env node
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { runBuild } from './build.js';
import { runDev } from './dev.js';

const USAGE = `
${pc.bold('seemore')} — turn a folder of Markdown into a docs site

  seemore [dir]           start the dev server
  seemore build [dir]     build a static site into dist/

Options
  --port <number>        dev server port (default 4040)
  --host [host]          expose the dev server on the network
  --open / --no-open     open a browser on start (default: no)
  --json                 print one machine-readable JSON line instead of the summary (dev only)
  --config <path>        path to seemore.config.ts
  --out <dir>            build output directory (default: dist)
  --base <path>          subpath the site is served from, e.g. /my-repo/
  -h, --help             show this message
  -v, --version          show the version
`;

/**
 * `parseArgs` has no notion of an optional value, so a bare `--host` — the documented form,
 * and the one Vite uses for "listen on every interface" — is rewritten to `--host=` first.
 */
function normaliseHostFlag(argv: string[]): string[] {
  const index = argv.indexOf('--host');
  if (index === -1) return argv;
  const next = argv[index + 1];
  if (next !== undefined && !next.startsWith('-')) return argv;
  return [...argv.slice(0, index), '--host=', ...argv.slice(index + 1)];
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: normaliseHostFlag(argv),
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      open: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      json: { type: 'boolean' },
      config: { type: 'string' },
      out: { type: 'string' },
      base: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help === true) {
    console.log(USAGE);
    return;
  }

  if (values.version === true) {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { packageRoot } = await import('../node/paths.js');
    const pkg = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    return;
  }

  const [command, ...rest] = positionals;
  const isBuild = command === 'build';
  const dir = isBuild ? rest[0] : command;

  const shared = { cwd: process.cwd(), dir, configPath: values.config, base: values.base };

  if (isBuild) {
    await runBuild({ ...shared, outDir: values.out });
    return;
  }

  await runDev({
    ...shared,
    port: values.port === undefined ? undefined : Number(values.port),
    host: values.host === undefined ? undefined : values.host === '' ? true : values.host,
    open: values.open === true && values['no-open'] !== true,
    json: values.json === true,
  });
}

main().catch((error: unknown) => {
  console.error(`\n${pc.red('seemore')} ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
