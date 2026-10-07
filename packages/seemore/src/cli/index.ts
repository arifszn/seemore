#!/usr/bin/env node
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { runBuild } from './build.js';
import { runDev } from './dev.js';
import { runExport } from './export.js';

const USAGE = `
${pc.bold('seemore')} — turn a folder of Markdown into a docs site

  seemore [dir]           start the dev server
  seemore build [dir]     build a static site into dist/
  seemore export <file>   export a page as a standalone HTML file

Options
  --port <number>        dev server port (default 4040)
  --host [host]          expose the dev server on the network
  --open / --no-open     open a browser on start (default: no)
  --json                 print one machine-readable JSON line instead of the summary (dev only)
  --config <path>        path to seemore.config.ts
  --out <dir>            build output directory (default: dist); for export, where the HTML file is written
  --out-file <path>      export only: the exact file to write, instead of --out
  --root <dir>           export only: the site the file belongs to (default: the file's folder)
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

/** Set once `dev` starts: its `main()` resolves when the server is listening, not when it is done. */
let servesUntilKilled = false;

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
      'out-file': { type: 'string' },
      root: { type: 'string' },
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
  const isExport = command === 'export';
  const dir = isBuild ? rest[0] : command;

  const shared = { cwd: process.cwd(), dir, configPath: values.config, base: values.base };

  if (isBuild) {
    await runBuild({ ...shared, outDir: values.out });
    return;
  }

  if (isExport) {
    const file = rest[0];
    if (file === undefined) throw new Error('Usage: seemore export <file> — name the Markdown file to export.');
    await runExport({
      cwd: shared.cwd,
      file,
      out: values.out,
      outFile: values['out-file'],
      root: values.root,
      configPath: values.config,
      base: values.base,
    });
    return;
  }

  servesUntilKilled = true;
  await runDev({
    ...shared,
    port: values.port === undefined ? undefined : Number(values.port),
    host: values.host === undefined ? undefined : values.host === '' ? true : values.host,
    open: values.open === true && values['no-open'] !== true,
    json: values.json === true,
  });
}

/**
 * Every command but `dev` exits explicitly when it is done. Run as an Electron utility
 * process, a script that has finished does not end the process (electron/electron#47228), so
 * a host waiting for a build would wait forever. The streams are flushed first: on macOS a
 * pipe is written asynchronously, and exiting straight away can cut off the last lines.
 */
function exitAfterFlush(code: number): void {
  process.exitCode = code;
  process.stdout.write('', () => {
    process.stderr.write('', () => process.exit(code));
  });
}

main().then(
  () => {
    if (!servesUntilKilled) exitAfterFlush(0);
  },
  (error: unknown) => {
    console.error(`\n${pc.red('seemore')} ${error instanceof Error ? error.message : String(error)}\n`);
    exitAfterFlush(1);
  },
);
