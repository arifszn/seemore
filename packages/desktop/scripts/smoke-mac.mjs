#!/usr/bin/env node
/**
 * Launch smoke test for a packaged macOS app (DESKTOP-SPEC §14.3, build step 4): starts the
 * signed bundle on a fixture folder, finds the dev server it forks, and requests a page and
 * the search index. The fixture has bold text, which broke the index once (§9).
 *
 * Usage: node scripts/smoke-mac.mjs <path to seemore.app>
 *
 * A throwaway profile answers the first-run prompts in advance: Move to Applications and the
 * default-handler prompt would otherwise wait for a click.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bundle = resolve(process.argv[2] ?? '');
const TIMEOUT_MS = 90_000;

const work = mkdtempSync(join(tmpdir(), 'seemore-smoke-'));
const site = join(work, 'site');
const profile = join(work, 'profile');
mkdirSync(site);
mkdirSync(profile);
writeFileSync(join(site, 'index.md'), '# Smoke\n\nSome **bold** and *slanted* text.\n');
writeFileSync(join(profile, 'update.json'), JSON.stringify({ autoCheck: false, moveDeclined: [bundle] }));
writeFileSync(join(profile, 'default-handler.json'), JSON.stringify({ asked: true }));

const app = spawn(join(bundle, 'Contents', 'MacOS', 'seemore'), [site], {
  env: { ...process.env, SEEMORE_USER_DATA: profile },
  stdio: 'inherit',
});

/** Ports the app's processes listen on: the main process and every descendant. */
function listeningPorts() {
  const pids = [String(app.pid)];
  for (let i = 0; i < pids.length; i++) {
    try {
      pids.push(...execFileSync('pgrep', ['-P', pids[i]], { encoding: 'utf8' }).split('\n').filter(Boolean));
    } catch {
      // No children.
    }
  }
  try {
    const out = execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(','), '-Fn'], { encoding: 'utf8' });
    return [...out.matchAll(/^n.*:(\d+)$/gm)].map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

async function get(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

let failure;
try {
  const started = Date.now();
  let port;
  while (port === undefined) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error('no dev server came up');
    if (app.exitCode !== null) throw new Error(`the app exited with ${app.exitCode}`);
    for (const candidate of listeningPorts()) {
      const page = await get(`http://localhost:${candidate}/`).catch(() => undefined);
      if (page?.status === 200) port = candidate;
    }
    if (port === undefined) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`smoke: dev server on port ${port}, ${((Date.now() - started) / 1000).toFixed(1)} s`);

  const search = await get(`http://localhost:${port}/api/search.json`);
  if (search.status !== 200 || !search.body.includes('bold')) {
    throw new Error(`search index: ${search.status} ${search.body.slice(0, 200)}`);
  }
  console.log('smoke: search index ok');
} catch (error) {
  failure = error;
} finally {
  // Waited for: the app writes its profile until it exits.
  const exited = new Promise((r) => (app.exitCode === null ? app.once('exit', r) : r()));
  app.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  rmSync(work, { recursive: true, force: true, maxRetries: 5 });
}
if (failure) {
  console.error(`smoke: failed: ${failure.message}`);
  process.exit(1);
}
console.log('smoke: passed');
process.exit(0);
