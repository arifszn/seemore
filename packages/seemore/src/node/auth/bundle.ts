import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { packageRoot } from '../paths.js';

const bundles = new Map<AuthScript, Promise<string>>();

export type AuthScript = 'lock' | 'sw';

/**
 * The lock screen's script and the service worker, each bundled into one classic script.
 *
 * Neither may depend on the app bundle, which is encrypted, and a module service worker is
 * not supported by every browser — so each gets a small build of its own from
 * `src/shared/auth`, which ships as source. Neither depends on the site, so one bundle per
 * process serves every build.
 */
export function bundleAuthScript(entry: AuthScript): Promise<string> {
  let bundle = bundles.get(entry);
  if (bundle === undefined) {
    bundle = compile(entry);
    bundles.set(entry, bundle);
    bundle.catch(() => bundles.delete(entry));
  }
  return bundle;
}

async function compile(entry: AuthScript): Promise<string> {
  const result = await build({
    root: packageRoot(),
    configFile: false,
    envDir: false,
    publicDir: false,
    clearScreen: false,
    logLevel: 'warn',
    cacheDir: join(tmpdir(), 'seemore', 'auth-scripts'),
    build: {
      write: false,
      minify: true,
      target: 'es2020',
      copyPublicDir: false,
      reportCompressedSize: false,
      lib: {
        entry: join(packageRoot(), 'src', 'shared', 'auth', `${entry}.ts`),
        formats: ['iife'],
        name: 'seemoreAuth',
        fileName: () => `${entry}.js`,
      },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]) as { output?: { type: string; code?: string }[] }[];
  const chunk = outputs.flatMap((output) => output.output ?? []).find((file) => file.type === 'chunk');
  if (chunk?.code === undefined) throw new Error(`seemore: bundling the ${entry} script produced no code.`);
  return chunk.code;
}
