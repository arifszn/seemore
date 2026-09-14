/**
 * The lock screen's script, bundled and inlined into the lock shell. It depends on nothing
 * in the app bundle, which is encrypted.
 *
 * Register the worker, derive the KEK from the typed password, prove it by unwrapping the
 * manifest's key, store the KEK, and reload — the worker then serves the app.
 */
import { deriveManifestKek, parseManifest, unlockManifest, type AuthManifest } from './crypto.js';
import { MANIFEST_FILE, SHELL_CONFIG_ID, WORKER_FILE, recordId } from './files.js';
import { indexedDbStore } from './store.js';

interface ShellConfig {
  base: string;
}

/** When the last hard-reload recovery ran; guards it from looping. */
const RESUME_KEY = 'seemore-auth:resume';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const config = JSON.parse(element(SHELL_CONFIG_ID).textContent ?? '{}') as ShellConfig;
const scope = new URL(config.base, location.origin).href;
const form = element<HTMLFormElement>('seemore-auth-form');
const input = element<HTMLInputElement>('seemore-auth-password');
const button = element<HTMLButtonElement>('seemore-auth-submit');
const status = element<HTMLParagraphElement>('seemore-auth-status');
const unsupported = element<HTMLParagraphElement>('seemore-auth-unsupported');
const buttonLabel = button.textContent ?? 'Unlock';

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submit();
});

void start();

async function start(): Promise<void> {
  // Not a secure context, service workers disabled, or a private window that refuses them.
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return showUnsupported();
  try {
    await navigator.serviceWorker.register(config.base + WORKER_FILE, { scope: config.base });
    // A browser can accept the registration and still never keep it (service workers
    // blocked by policy): without one, unlocking could only hang.
    if ((await navigator.serviceWorker.getRegistration(config.base)) === undefined) return showUnsupported();
  } catch {
    return showUnsupported();
  }

  showForm();
  await resumeAfterHardReload();
}

function showForm(): void {
  unsupported.hidden = true;
  form.hidden = false;
  input.focus();
}

function showUnsupported(): void {
  form.hidden = true;
  unsupported.hidden = false;
}

async function submit(): Promise<void> {
  button.disabled = true;
  button.textContent = 'Unlocking…';
  status.textContent = '';

  let manifest: AuthManifest;
  let kek: CryptoKey;
  try {
    manifest = await fetchManifest();
    kek = await deriveManifestKek(input.value, manifest);
  } catch {
    return fail("Couldn't load this site. Check your connection and try again.");
  }

  try {
    await unlockManifest(manifest, kek);
  } catch {
    return fail('Password is incorrect', true);
  }

  try {
    await storeKey(manifest, kek);
    await controlledByWorker();
  } catch {
    return fail("This browser blocked site storage, so the key can't be saved. Allow site data or try another browser.");
  }

  location.reload();
}

function fail(message: string, shake = false): void {
  button.disabled = false;
  button.textContent = buttonLabel;
  status.textContent = message;
  if (shake) {
    form.classList.remove('lock-shake');
    void form.offsetWidth;
    form.classList.add('lock-shake');
  }
  input.focus();
  input.select();
}

async function fetchManifest(): Promise<AuthManifest> {
  const response = await fetch(config.base + MANIFEST_FILE, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${MANIFEST_FILE} answered ${response.status}.`);
  return parseManifest(await response.json());
}

async function storeKey(manifest: AuthManifest, kek: CryptoKey): Promise<void> {
  await indexedDbStore().put(recordId(scope, manifest.kdf.salt), { kek, lastSeen: Date.now() });
}

/**
 * `clients.claim()` hands this document to the worker as it activates. If the worker was
 * already active and this document still is not controlled, a plain reload is what hands it
 * over, so waiting is capped.
 */
async function controlledByWorker(): Promise<void> {
  const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), delay(10_000).then(() => false)]);
  if (!ready) throw new Error('The service worker never became active.');
  if (navigator.serviceWorker.controller !== null) return;
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, 3000);
  });
}

/**
 * A shift-reload bypasses the worker, so a visitor who is still unlocked lands on the lock
 * shell. One ordinary reload hands the navigation back to the worker, which decides.
 */
async function resumeAfterHardReload(): Promise<void> {
  if (navigator.serviceWorker.controller !== null) return;
  try {
    const manifest = await fetchManifest();
    if ((await indexedDbStore().get(recordId(scope, manifest.kdf.salt))) === undefined) return;
    if (Date.now() - Number(sessionStorage.getItem(RESUME_KEY)) < 10_000) return;
    sessionStorage.setItem(RESUME_KEY, String(Date.now()));
    await navigator.serviceWorker.ready;
    location.reload();
  } catch {
    // Nothing to resume: the form is already showing.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
