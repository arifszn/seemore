/**
 * Navigation, new-window and permission decisions for site windows (DESKTOP-SPEC §8). Pure,
 * so each rule is tested on its own; `siteWindow.ts` wires them to Electron's events.
 */
import { fileURLToPath } from 'node:url';

export type NavigationDecision =
  | { action: 'allow' }
  | { action: 'open-path'; path: string }
  | { action: 'external'; url: string }
  | { action: 'deny' };

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * A top-level navigation in a site window. Its own origin stays; a dropped file is opened as
 * a path; a web or mail link leaves for the browser; anything else is dropped.
 */
export function decideNavigation(url: string, ownOrigin: string): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { action: 'deny' };
  }
  if (parsed.origin === ownOrigin && parsed.protocol !== 'file:') return { action: 'allow' };
  if (parsed.protocol === 'file:') {
    try {
      return { action: 'open-path', path: fileURLToPath(parsed) };
    } catch {
      return { action: 'deny' };
    }
  }
  return EXTERNAL_SCHEMES.has(parsed.protocol) ? { action: 'external', url: parsed.href } : { action: 'deny' };
}

/** `window.open` and `target="_blank"`: never a new app window; web and mail links go out. */
export function decideNewWindow(url: string): { action: 'external'; url: string } | { action: 'deny' } {
  try {
    const parsed = new URL(url);
    return EXTERNAL_SCHEMES.has(parsed.protocol) ? { action: 'external', url: parsed.href } : { action: 'deny' };
  } catch {
    return { action: 'deny' };
  }
}

/**
 * The only permission a site page gets is the clipboard write behind seemore's copy buttons,
 * and only from its own server.
 */
export function allowPermission(permission: string, requestingOrigin: string, ownOrigin: string | undefined): boolean {
  return permission === 'clipboard-sanitized-write' && ownOrigin !== undefined && originOf(requestingOrigin) === ownOrigin;
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
