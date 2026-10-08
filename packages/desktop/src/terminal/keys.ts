/**
 * VS Code's in-terminal keys (DESKTOP-SPEC §7.4; code.visualstudio.com/docs/terminal/basics,
 * read 2026-10-08), decided before xterm sees the key. Copy and paste are the page's own on
 * every platform: on macOS the Edit menu's native `copy:` and `paste:` don't reach xterm in
 * a child view, and a key the page handles never reaches the menu.
 */
export type KeyAction =
  | { kind: 'find' }
  | { kind: 'copy' }
  | { kind: 'paste' }
  | { kind: 'scroll'; by: 'line' | 'page'; amount: 1 | -1 }
  | { kind: 'scroll'; to: 'top' | 'bottom' };

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

type Mods = 'ctrl' | 'shift' | 'alt' | 'meta';

/** Exactly these modifiers, no others. */
function only(event: KeyLike, ...mods: Mods[]): boolean {
  const want = new Set(mods);
  return (
    event.ctrlKey === want.has('ctrl') &&
    event.shiftKey === want.has('shift') &&
    event.altKey === want.has('alt') &&
    event.metaKey === want.has('meta')
  );
}

export function keyAction(event: KeyLike, platform: string, hasSelection: boolean): KeyAction | undefined {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (platform === 'darwin') {
    if (key === 'f' && only(event, 'meta')) return { kind: 'find' };
    if (key === 'c' && only(event, 'meta')) return hasSelection ? { kind: 'copy' } : undefined;
    if (key === 'v' && only(event, 'meta')) return { kind: 'paste' };
    if (key === 'PageUp' && only(event, 'alt', 'meta')) return { kind: 'scroll', by: 'line', amount: -1 };
    if (key === 'PageDown' && only(event, 'alt', 'meta')) return { kind: 'scroll', by: 'line', amount: 1 };
    if (key === 'PageUp' && only(event)) return { kind: 'scroll', by: 'page', amount: -1 };
    if (key === 'PageDown' && only(event)) return { kind: 'scroll', by: 'page', amount: 1 };
    if (key === 'Home' && only(event, 'meta')) return { kind: 'scroll', to: 'top' };
    if (key === 'End' && only(event, 'meta')) return { kind: 'scroll', to: 'bottom' };
    return undefined;
  }

  if (key === 'f' && only(event, 'ctrl')) return { kind: 'find' };
  if (key === 'PageUp' && only(event, 'shift')) return { kind: 'scroll', by: 'page', amount: -1 };
  if (key === 'PageDown' && only(event, 'shift')) return { kind: 'scroll', by: 'page', amount: 1 };

  if (platform === 'win32') {
    // Ctrl+C copies a selection; with none, it is the shell's interrupt.
    if (key === 'c' && only(event, 'ctrl') && hasSelection) return { kind: 'copy' };
    if (key === 'v' && only(event, 'ctrl')) return { kind: 'paste' };
    if (key === 'PageUp' && only(event, 'ctrl', 'alt')) return { kind: 'scroll', by: 'line', amount: -1 };
    if (key === 'PageDown' && only(event, 'ctrl', 'alt')) return { kind: 'scroll', by: 'line', amount: 1 };
    if (key === 'Home' && only(event, 'ctrl')) return { kind: 'scroll', to: 'top' };
    if (key === 'End' && only(event, 'ctrl')) return { kind: 'scroll', to: 'bottom' };
    return undefined;
  }

  // Linux and the rest.
  if (key === 'c' && only(event, 'ctrl', 'shift')) return { kind: 'copy' };
  if (key === 'v' && only(event, 'ctrl', 'shift')) return { kind: 'paste' };
  if (key === 'Insert' && only(event, 'shift')) return { kind: 'paste' };
  if (key === 'ArrowUp' && only(event, 'ctrl', 'shift')) return { kind: 'scroll', by: 'line', amount: -1 };
  if (key === 'ArrowDown' && only(event, 'ctrl', 'shift')) return { kind: 'scroll', by: 'line', amount: 1 };
  if (key === 'Home' && only(event, 'shift')) return { kind: 'scroll', to: 'top' };
  if (key === 'End' && only(event, 'shift')) return { kind: 'scroll', to: 'bottom' };
  return undefined;
}
