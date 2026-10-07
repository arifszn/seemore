import { execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedError, verifyFeed } from '../src/main/update/feed.js';
import { createMacUpdater, INSTALL_SCRIPT } from '../src/main/update/macUpdater.js';
import { type PlatformUpdater, type Staged, VerificationError } from '../src/main/update/platform.js';
import { CHECK_INTERVAL_MS, parseUpdateState, shouldCheck, shouldOffer } from '../src/main/update/policy.js';
import { Updater, type UpdaterUi } from '../src/main/update/updater.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey };
}

function signedFeed(payload: object, privateKey: ReturnType<typeof keyPair>['privateKey']) {
  const text = JSON.stringify(payload);
  return { payload: text, signature: sign(null, Buffer.from(text), privateKey).toString('base64') };
}

const asset = (version: string, arch: string) => ({
  url: `https://github.com/arifszn/seemore/releases/download/desktop-v${version}/seemore-${version}-mac-${arch}.zip`,
  sha256: 'a'.repeat(64),
});

describe('check policy', () => {
  const now = 1_000_000_000;

  it('runs a manual check always, automatic ones only when enabled, launch after 6 h', () => {
    const off = parseUpdateState({ autoCheck: false, lastCheckedAt: 0 });
    expect(shouldCheck('manual', off, now)).toBe(true);
    expect(shouldCheck('timer', off, now)).toBe(false);
    expect(shouldCheck('launch', off, now)).toBe(false);

    const recent = parseUpdateState({ lastCheckedAt: now - CHECK_INTERVAL_MS + 1 });
    expect(shouldCheck('launch', recent, now)).toBe(false);
    expect(shouldCheck('timer', recent, now)).toBe(true);
    expect(shouldCheck('launch', parseUpdateState({ lastCheckedAt: now - CHECK_INTERVAL_MS }), now)).toBe(true);
    expect(shouldCheck('launch', parseUpdateState(undefined), now)).toBe(true);
  });

  it('offers only newer versions; a skipped one only to a manual check', () => {
    const state = parseUpdateState({ skippedVersion: '1.2.0' });
    expect(shouldOffer('1.1.0', '1.1.0', state, 'manual')).toBe(false);
    expect(shouldOffer('1.0.0', '1.1.0', state, 'manual')).toBe(false);
    expect(shouldOffer('1.2.0', '1.1.0', state, 'timer')).toBe(false);
    expect(shouldOffer('1.2.0', '1.1.0', state, 'manual')).toBe(true);
    expect(shouldOffer('1.3.0', '1.1.0', state, 'launch')).toBe(true);
  });

  it('defaults autoCheck to true and drops malformed fields', () => {
    expect(parseUpdateState({ staged: { version: 1 }, moveDeclined: ['/a', 2] })).toEqual({
      autoCheck: true,
      lastCheckedAt: undefined,
      skippedVersion: undefined,
      staged: undefined,
      moveDeclined: ['/a'],
    });
  });
});

describe('macOS feed', () => {
  const { publicPem, privateKey } = keyPair();
  const manifest = { version: '1.2.0', arm64: asset('1.2.0', 'arm64'), x64: asset('1.2.0', 'x64') };

  it('accepts a feed signed with the compiled-in key', () => {
    expect(verifyFeed(signedFeed(manifest, privateKey), publicPem)).toEqual(manifest);
  });

  it('rejects a payload changed after signing, another key, or no key', () => {
    const feed = signedFeed(manifest, privateKey);
    expect(() => verifyFeed({ ...feed, payload: feed.payload.replace('1.2.0', '9.9.9') }, publicPem)).toThrow('bad signature');
    expect(() => verifyFeed(signedFeed(manifest, keyPair().privateKey), publicPem)).toThrow('bad signature');
    expect(() => verifyFeed(feed, '')).toThrow('no update key');
    expect(() => verifyFeed({ payload: 1 }, publicPem)).toThrow(FeedError);
  });

  it('rejects signed assets outside this version’s release', () => {
    const other = { ...manifest, x64: { ...manifest.x64, url: 'https://example.com/seemore.zip' } };
    expect(() => verifyFeed(signedFeed(other, privateKey), publicPem)).toThrow('invalid asset');
    const stale = { ...manifest, arm64: asset('1.1.0', 'arm64') };
    expect(() => verifyFeed(signedFeed(stale, privateKey), publicPem)).toThrow('invalid asset');
  });
});

/** A platform whose feed and downloads the test controls. */
class FakePlatform implements PlatformUpdater {
  version = '1.2.0';
  canInstall = true;
  downloads: string[] = [];
  discarded: string[] = [];
  installed: string[] = [];
  restorable = true;
  failDownload: Error | undefined;
  latest = async () => this.version;
  installable = () => this.canInstall;
  async download(version: string) {
    this.downloads.push(version);
    if (this.failDownload) throw this.failDownload;
    return `/staged/${version}`;
  }
  restore = async () => this.restorable;
  discard = (staged: Staged) => void this.discarded.push(staged.version);
  install = async (staged: Staged) => void this.installed.push(staged.version);
}

describe('Updater', () => {
  let dir: string;
  let statePath: string;
  let platform: FakePlatform;
  let answers: number[];
  let asked: string[];
  let told: string[];
  let closed: string[];
  /** What `closed` held when each prompt opened. */
  let closedAtAsk: string[][];
  let opened: string[];
  let jobs: boolean;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-update-'));
    statePath = join(dir, 'update.json');
    platform = new FakePlatform();
    answers = [];
    asked = [];
    told = [];
    closed = [];
    closedAtAsk = [];
    opened = [];
    jobs = false;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ui: UpdaterUi = {
    ask: async (message) => {
      asked.push(message);
      closedAtAsk.push([...closed]);
      return answers.shift() ?? 2;
    },
    inform: (message) => {
      told.push(message);
      return () => void closed.push(message);
    },
    openExternal: (url) => void opened.push(url),
  };
  const make = () =>
    new Updater({ platform, currentVersion: '1.1.0', statePath, jobsRunning: () => jobs, ui, onChange: () => undefined, log: () => undefined });
  const state = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('downloads a newer version, stages it, and installs on Restart to Update', async () => {
    answers = [0];
    const updater = make();
    await updater.check('timer');
    await settle();
    expect(platform.downloads).toEqual(['1.2.0']);
    expect(asked).toEqual(['seemore 1.2.0 is ready to install.']);
    expect(platform.installed).toEqual(['1.2.0']);
    expect(state().staged).toEqual({ version: '1.2.0', path: '/staged/1.2.0' });
    expect(typeof state().lastCheckedAt).toBe('number');
  });

  it('says so on a manual check that finds nothing newer', async () => {
    platform.version = '1.1.0';
    await make().check('manual');
    expect(told).toEqual(['seemore 1.1.0 is the latest version.']);
    expect(platform.downloads).toEqual([]);
  });

  it('closes the Downloading notice of a manual check before the prompt or the error', async () => {
    await make().check('manual');
    await settle();
    expect(told).toEqual(['Downloading seemore 1.2.0.']);
    expect(closedAtAsk).toEqual([['Downloading seemore 1.2.0.']]);

    told = [];
    closed = [];
    platform.version = '1.3.0';
    platform.failDownload = new VerificationError('sha512 checksum mismatch');
    const updater = make();
    await updater.check('manual');
    expect(told).toEqual(['Downloading seemore 1.3.0.', 'Could not check for updates.']);
    expect(closed).toEqual(['Downloading seemore 1.3.0.']);
  });

  it('Later keeps the update ready for the menu; Skip deletes it and stops automatic offers', async () => {
    const updater = make();
    await updater.check('timer');
    await settle();
    expect(updater.readyVersion).toBe('1.2.0');

    answers = [1];
    await updater.check('manual');
    await settle();
    expect(asked).toHaveLength(2);
    expect(updater.readyVersion).toBeUndefined();
    expect(platform.discarded).toEqual(['1.2.0']);
    expect(state().skippedVersion).toBe('1.2.0');

    await updater.check('timer');
    expect(platform.downloads).toEqual(['1.2.0']);
  });

  it('holds the prompt while a job runs, and shows it when jobs finish', async () => {
    jobs = true;
    const updater = make();
    await updater.check('timer');
    await settle();
    expect(asked).toEqual([]);
    jobs = false;
    updater.jobsIdle();
    await settle();
    expect(asked).toEqual(['seemore 1.2.0 is ready to install.']);
  });

  it('never downloads a version again after it failed verification this session', async () => {
    platform.failDownload = new VerificationError('The downloaded update has the wrong checksum.');
    const updater = make();
    await updater.check('timer');
    await updater.check('timer');
    expect(platform.downloads).toEqual(['1.2.0']);
    await updater.check('manual');
    expect(told.at(-1)).toMatch(/failed verification earlier/);
  });

  it('links to the release when this copy cannot replace itself', async () => {
    platform.canInstall = false;
    answers = [0];
    await make().check('timer');
    await settle();
    expect(platform.downloads).toEqual([]);
    expect(opened).toEqual(['https://github.com/arifszn/seemore/releases/tag/desktop-v1.2.0']);
  });

  it('restores a staged update at start without downloading, and drops an overtaken one', async () => {
    const updater = make();
    await updater.check('timer');
    await settle();

    const next = make();
    next.start();
    await settle();
    await settle();
    next.stop();
    expect(next.readyVersion).toBe('1.2.0');
    expect(platform.downloads).toEqual(['1.2.0']);

    platform.version = '1.3.0';
    await next.check('manual');
    await settle();
    expect(platform.discarded).toEqual(['1.2.0']);
    expect(next.readyVersion).toBe('1.3.0');
  });

  it('drops a staged update the running version has already reached', async () => {
    writeFileSync(statePath, JSON.stringify({ staged: { version: '1.1.0', path: '/staged/1.1.0' } }));
    const updater = make();
    updater.start();
    await settle();
    updater.stop();
    expect(platform.discarded).toEqual(['1.1.0']);
    expect(updater.readyVersion).toBeUndefined();
  });
});

/** A minimal ad-hoc signed `seemore.app` of the given version. */
function fakeBundle(parent: string, version: string, marker: string): string {
  const app = join(parent, 'seemore.app');
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.seemore.desktop</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleExecutable</key><string>seemore</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
  );
  copyFileSync('/usr/bin/true', join(app, 'Contents', 'MacOS', 'seemore'));
  mkdirSync(join(app, 'Contents', 'Resources'));
  writeFileSync(join(app, 'Contents', 'Resources', 'marker'), marker);
  execFileSync('codesign', ['--force', '--sign', '-', app]);
  return app;
}

describe.runIf(process.platform === 'darwin')('macOS updater', () => {
  let dir: string;
  const { publicPem, privateKey } = keyPair();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-macupdate-'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  /** An installed 1.1.0 next to a release zip of 1.2.0, served through a stubbed fetch. */
  function setup(options: { sha256?: string; version?: string; pid?: number } = {}) {
    const installed = fakeBundle(join(dir, 'Applications'), '1.1.0', 'old');
    const built = fakeBundle(join(dir, 'build'), options.version ?? '1.2.0', 'new');
    const zip = join(dir, 'update.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', built, zip]);
    const bytes = readFileSync(zip);
    const sha256 = options.sha256 ?? createHash('sha256').update(bytes).digest('hex');
    const feed = signedFeed({ version: '1.2.0', arm64: { ...asset('1.2.0', 'arm64'), sha256 }, x64: { ...asset('1.2.0', 'x64'), sha256 } }, privateKey);
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('latest-mac.json') ? new Response(JSON.stringify(feed)) : new Response(bytes),
    );
    let quit = false;
    const updater = createMacUpdater({
      bundlePath: installed,
      arch: 'arm64',
      publicKey: publicPem,
      pid: options.pid ?? process.pid,
      quit: () => {
        quit = true;
      },
      feedUrl: 'https://feed.test/latest-mac.json',
      relaunch: '/usr/bin/true',
    });
    return { installed, updater, quitCalled: () => quit };
  }

  it('downloads, verifies and stages the bundle next to the installed app', async () => {
    const { installed, updater } = setup();
    expect(await updater.latest()).toBe('1.2.0');
    expect(updater.installable()).toBe(true);
    const staged = await updater.download('1.2.0');
    expect(staged).toBe(join(dir, 'Applications', '.seemore-update-1.2.0', 'seemore.app'));
    expect(readFileSync(join(staged, 'Contents', 'Resources', 'marker'), 'utf8')).toBe('new');
    expect(readFileSync(join(installed, 'Contents', 'Resources', 'marker'), 'utf8')).toBe('old');
  });

  it('rejects a zip with the wrong checksum, or a bundle of another version, and leaves nothing behind', async () => {
    const bad = setup({ sha256: 'b'.repeat(64) });
    await bad.updater.latest();
    await expect(bad.updater.download('1.2.0')).rejects.toBeInstanceOf(VerificationError);
    expect(existsSync(join(dir, 'Applications', '.seemore-update-1.2.0'))).toBe(false);

    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    const wrong = setup({ version: '1.3.0' });
    await wrong.updater.latest();
    await expect(wrong.updater.download('1.2.0')).rejects.toThrow(/wrong version/);
  });

  it('swaps the bundles once the app has exited, then cleans up', async () => {
    // A process that has already exited stands in for the quitting app.
    const gone = spawn('true');
    await new Promise((resolve) => gone.on('exit', resolve));
    const { installed, updater, quitCalled } = setup({ pid: gone.pid });
    await updater.latest();
    const path = await updater.download('1.2.0');
    await updater.install({ version: '1.2.0', path });
    expect(quitCalled()).toBe(true);
    await expect.poll(() => readFileSync(join(installed, 'Contents', 'Resources', 'marker'), 'utf8'), { timeout: 5000 }).toBe('new');
    await expect.poll(() => existsSync(join(dir, 'Applications', '.seemore-update-1.2.0')), { timeout: 5000 }).toBe(false);
    execFileSync('codesign', ['--verify', '--deep', '--strict', installed]);
  });

  it('waits for the app’s process to exit before swapping', async () => {
    const old = fakeBundle(join(dir, 'a'), '1.1.0', 'old');
    const next = fakeBundle(join(dir, 'stage'), '1.2.0', 'new');
    writeFileSync(join(dir, 'install.sh'), INSTALL_SCRIPT);
    const sleeper = spawn('sleep', ['0.6']);
    const script = spawn('/bin/sh', [join(dir, 'install.sh'), String(sleeper.pid), old, next, '/usr/bin/true']);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(readFileSync(join(old, 'Contents', 'Resources', 'marker'), 'utf8')).toBe('old');
    await new Promise((resolve) => script.on('exit', resolve));
    expect(readFileSync(join(old, 'Contents', 'Resources', 'marker'), 'utf8')).toBe('new');
  });
});
