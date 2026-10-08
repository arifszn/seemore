#!/usr/bin/env node
/**
 * Launch smoke test for a packaged macOS app (DESKTOP-SPEC §14.3, build step 4): starts the
 * signed bundle on a fixture folder, finds the dev server it forks, and requests a page and
 * the search index. The fixture has bold text, which broke the index once (§9). Then the
 * terminal panel, open by default (§7.4): a shell at the site root proves node-pty loads from
 * app.asar.unpacked and spawn-helper runs.
 *
 * Usage: node scripts/smoke-mac.mjs <path to seemore.app>
 *
 * A throwaway profile answers the first-run prompts in advance: Move to Applications and the
 * default-handler prompt would otherwise wait for a click.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const bundle = resolve(process.argv[2] ?? '');
const TIMEOUT_MS = 90_000;

// Canonical, as the app opens it: the shell's cwd is compared with it.
const work = realpathSync(mkdtempSync(join(tmpdir(), 'seemore-smoke-')));
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

/** The app's main process and every descendant. */
function appPids() {
  const pids = [String(app.pid)];
  for (let i = 0; i < pids.length; i++) {
    try {
      pids.push(...execFileSync('pgrep', ['-P', pids[i]], { encoding: 'utf8' }).split('\n').filter(Boolean));
    } catch {
      // No children.
    }
  }
  return pids;
}

/** Ports the app's processes listen on. */
function listeningPorts() {
  const pids = appPids();
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

  // The user's shell, as the app picks it (shells.ts), running in the site folder.
  const shell = basename(process.env.SHELL || '/bin/zsh');
  const shellAtRoot = () =>
    appPids().some((pid) => {
      try {
        const name = execFileSync('ps', ['-o', 'comm=', '-p', pid], { encoding: 'utf8' }).trim();
        const cwd = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', pid, '-Fn'], { encoding: 'utf8' }).match(/^n(.*)$/m)?.[1];
        return basename(name.replace(/^-/, '')) === shell && cwd === site;
      } catch {
        return false;
      }
    });
  const shellStarted = Date.now();
  while (!shellAtRoot()) {
    if (Date.now() - shellStarted > 20_000) throw new Error(`no ${shell} running in ${site}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`smoke: terminal ${shell} at the site root`);
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
