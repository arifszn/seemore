import { describe, expect, it } from 'vitest';
import { keyAction, type KeyLike } from '../src/terminal/keys.js';

const key = (k: string, mods: Partial<Omit<KeyLike, 'key'>> = {}): KeyLike => ({
  key: k,
  code: '',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('menu shortcuts', () => {
  it('leaves Ctrl+` and Ctrl+Shift+` to the menu on every platform, by physical key', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(keyAction(key('`', { code: 'Backquote', ctrlKey: true }), platform, false)).toEqual({ kind: 'menu' });
      expect(keyAction(key('~', { code: 'Backquote', ctrlKey: true, shiftKey: true }), platform, false)).toEqual({ kind: 'menu' });
    }
  });

  it('leaves Focus Previous / Next Terminal to the menu', () => {
    expect(keyAction(key('{', { code: 'BracketLeft', metaKey: true, shiftKey: true }), 'darwin', false)).toEqual({ kind: 'menu' });
    expect(keyAction(key('}', { code: 'BracketRight', metaKey: true, shiftKey: true }), 'darwin', false)).toEqual({ kind: 'menu' });
    expect(keyAction(key('PageUp', { ctrlKey: true }), 'win32', false)).toEqual({ kind: 'menu' });
    expect(keyAction(key('PageDown', { ctrlKey: true }), 'linux', false)).toEqual({ kind: 'menu' });
  });
});

describe('keyAction on macOS', () => {
  const on = (event: KeyLike) => keyAction(event, 'darwin', false);

  it('finds with Cmd+F, and leaves Ctrl+F to the shell', () => {
    expect(on(key('f', { metaKey: true }))).toEqual({ kind: 'find' });
    expect(on(key('f', { ctrlKey: true }))).toBeUndefined();
  });

  it('scrolls as VS Code does', () => {
    expect(on(key('PageUp', { altKey: true, metaKey: true }))).toEqual({ kind: 'scroll', by: 'line', amount: -1 });
    expect(on(key('PageDown', { altKey: true, metaKey: true }))).toEqual({ kind: 'scroll', by: 'line', amount: 1 });
    expect(on(key('PageUp'))).toEqual({ kind: 'scroll', by: 'page', amount: -1 });
    expect(on(key('Home', { metaKey: true }))).toEqual({ kind: 'scroll', to: 'top' });
    expect(on(key('End', { metaKey: true }))).toEqual({ kind: 'scroll', to: 'bottom' });
  });

  it('copies a selection with Cmd+C and pastes with Cmd+V', () => {
    expect(keyAction(key('c', { metaKey: true }), 'darwin', true)).toEqual({ kind: 'copy' });
    expect(on(key('c', { metaKey: true }))).toBeUndefined();
    expect(on(key('v', { metaKey: true }))).toEqual({ kind: 'paste' });
    expect(on(key('c', { ctrlKey: true }))).toBeUndefined();
  });
});

describe('keyAction on Windows', () => {
  it('copies with Ctrl+C only when there is a selection', () => {
    expect(keyAction(key('c', { ctrlKey: true }), 'win32', true)).toEqual({ kind: 'copy' });
    expect(keyAction(key('c', { ctrlKey: true }), 'win32', false)).toBeUndefined();
  });

  it('pastes with Ctrl+V, finds with Ctrl+F, and scrolls as VS Code does', () => {
    const on = (event: KeyLike) => keyAction(event, 'win32', false);
    expect(on(key('v', { ctrlKey: true }))).toEqual({ kind: 'paste' });
    expect(on(key('F', { ctrlKey: true }))).toEqual({ kind: 'find' });
    expect(on(key('PageUp', { ctrlKey: true, altKey: true }))).toEqual({ kind: 'scroll', by: 'line', amount: -1 });
    expect(on(key('PageDown', { shiftKey: true }))).toEqual({ kind: 'scroll', by: 'page', amount: 1 });
    expect(on(key('Home', { ctrlKey: true }))).toEqual({ kind: 'scroll', to: 'top' });
    expect(on(key('PageUp'))).toBeUndefined();
  });
});

describe('keyAction on Linux', () => {
  const on = (event: KeyLike) => keyAction(event, 'linux', true);

  it('copies and pastes with Ctrl+Shift, and leaves Ctrl+C to the shell', () => {
    expect(on(key('C', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'copy' });
    expect(on(key('V', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'paste' });
    expect(on(key('Insert', { shiftKey: true }))).toEqual({ kind: 'paste' });
    expect(on(key('c', { ctrlKey: true }))).toBeUndefined();
  });

  it('scrolls as VS Code does', () => {
    expect(on(key('ArrowUp', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'scroll', by: 'line', amount: -1 });
    expect(on(key('PageUp', { shiftKey: true }))).toEqual({ kind: 'scroll', by: 'page', amount: -1 });
    expect(on(key('End', { shiftKey: true }))).toEqual({ kind: 'scroll', to: 'bottom' });
  });
});
