import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pathsFromArgv } from '../src/main/argv.js';
import { defaultHandlerPlatform, shouldOfferDefault } from '../src/main/defaultHandler.js';
import { allowPermission, decideNavigation, decideNewWindow } from '../src/main/policy.js';
import { addRecent, MAX_RECENTS, parseRecents } from '../src/main/recents.js';
import { resolveTarget } from '../src/main/target.js';
import { WindowRegistry } from '../src/main/windowRegistry.js';

const home = resolve('home', 'me');
const notes = join(home, 'notes');

describe('pathsFromArgv', () => {
  const cwd = resolve('work');

  it('skips the executable, and the app directory when unpackaged', () => {
    expect(pathsFromArgv(['/app/seemore', 'a.md'], cwd, true)).toEqual([join(cwd, 'a.md')]);
    expect(pathsFromArgv(['/bin/electron', '.', 'a.md'], cwd, false)).toEqual([join(cwd, 'a.md')]);
  });

  it("resolves relative paths against the given cwd, not this process's", () => {
    expect(pathsFromArgv(['exe', '../docs'], cwd, true)).toEqual([resolve(cwd, '..', 'docs')]);
    expect(pathsFromArgv(['exe', notes], cwd, true)).toEqual([notes]);
  });

  it('drops switches even when they come before the app directory', () => {
    expect(pathsFromArgv(['/bin/electron', '--original-process-start-time=1', '/app', 'a.md'], cwd, false)).toEqual([
      join(cwd, 'a.md'),
    ]);
  });

  it('drops switches Chromium and macOS add', () => {
    expect(pathsFromArgv(['exe', '--allow-file-access-from-files', '-psn_0_123', 'x.md'], cwd, true)).toEqual([
      join(cwd, 'x.md'),
    ]);
  });
});

describe('resolveTarget', () => {
  const context = (overrides: Partial<Parameters<typeof resolveTarget>[1]> = {}) => ({
    openRoots: [],
    home,
    isDirectory: (path: string) => !path.endsWith('.md'),
    hasConfig: () => false,
    ...overrides,
  });

  it('takes a folder as its own root, exactly', () => {
    expect(resolveTarget(notes, context({ hasConfig: () => true }))).toEqual({ kind: 'folder', root: notes });
  });

  it('shows a file inside an open site that contains it', () => {
    const file = join(notes, 'a', 'b.md');
    expect(resolveTarget(file, context({ openRoots: [notes] }))).toEqual({ kind: 'file', root: notes, file });
  });

  it('lets a deeper config ancestor win over an open root', () => {
    const file = join(notes, 'proj', 'x.md');
    const target = resolveTarget(file, context({ openRoots: [notes], hasConfig: (dir) => dir === join(notes, 'proj') }));
    expect(target.root).toBe(join(notes, 'proj'));
  });

  it("does not look for a config above the home directory", () => {
    const file = join(notes, 'x.md');
    const target = resolveTarget(file, context({ hasConfig: (dir) => dir === resolve(home, '..') }));
    expect(target.root).toBe(notes);
  });
});

describe('decideNavigation', () => {
  const own = 'http://localhost:4100';

  it('allows its own origin, and nothing that only resembles it', () => {
    expect(decideNavigation('http://localhost:4100/guide/intro', own)).toEqual({ action: 'allow' });
    expect(decideNavigation('http://127.0.0.1:4100/', own).action).toBe('external');
    expect(decideNavigation('http://localhost:4101/', own).action).toBe('external');
  });

  it('never navigates to a file', () => {
    expect(decideNavigation(pathToFileURL(resolve('docs', 'a.md')).href, own).action).toBe('deny');
  });

  it('sends web and mail links out, and drops every other scheme', () => {
    expect(decideNavigation('https://example.com/', own)).toEqual({ action: 'external', url: 'https://example.com/' });
    expect(decideNavigation('mailto:a@b.c', own).action).toBe('external');
    expect(decideNavigation('javascript:alert(1)', own).action).toBe('deny');
    expect(decideNavigation('vscode://file/etc/hosts', own).action).toBe('deny');
    expect(decideNavigation('not a url', own).action).toBe('deny');
  });
});

describe('decideNewWindow', () => {
  it('never opens an app window', () => {
    expect(decideNewWindow('https://example.com/').action).toBe('external');
    expect(decideNewWindow('http://localhost:4100/page').action).toBe('external');
    expect(decideNewWindow('smb://server/share').action).toBe('deny');
    expect(decideNewWindow('not a url').action).toBe('deny');
  });

  it('routes a dropped file to open', () => {
    const file = resolve('docs', 'a.md');
    expect(decideNewWindow(pathToFileURL(file).href)).toEqual({ action: 'open-path', path: file });
  });
});

describe('allowPermission', () => {
  it('allows only the clipboard write, only from its own origin', () => {
    expect(allowPermission('clipboard-sanitized-write', 'http://localhost:4100/', 'http://localhost:4100')).toBe(true);
    expect(allowPermission('clipboard-sanitized-write', 'http://localhost:9999/', 'http://localhost:4100')).toBe(false);
    expect(allowPermission('clipboard-read', 'http://localhost:4100/', 'http://localhost:4100')).toBe(false);
    expect(allowPermission('media', 'http://localhost:4100/', 'http://localhost:4100')).toBe(false);
    expect(allowPermission('clipboard-sanitized-write', 'http://localhost:4100/', undefined)).toBe(false);
  });
});

describe('recents', () => {
  it('puts the newest first, keeps one entry per path, and caps the list', () => {
    let list = addRecent([], { path: '/a', kind: 'folder' });
    list = addRecent(list, { path: '/b.md', kind: 'file' });
    list = addRecent(list, { path: '/a', kind: 'folder' });
    expect(list.map((entry) => entry.path)).toEqual(['/a', '/b.md']);

    for (let i = 0; i < 20; i++) list = addRecent(list, { path: `/${i}`, kind: 'folder' });
    expect(list).toHaveLength(MAX_RECENTS);
  });

  it('reads back only well-formed entries', () => {
    expect(parseRecents([{ path: '/a', kind: 'folder' }, { path: 1 }, null, { path: '/b', kind: 'x' }])).toEqual([
      { path: '/a', kind: 'folder' },
    ]);
    expect(parseRecents('nope')).toEqual([]);
  });
});

describe('WindowRegistry', () => {
  it('tracks windows per root both ways, and moves a window that changes root', () => {
    const registry = new WindowRegistry();
    registry.add(1, '/a');
    registry.add(2, '/a');
    registry.add(3, '/b');
    expect(registry.windows('/a')).toEqual([1, 2]);

    registry.add(2, '/b');
    expect(registry.windows('/a')).toEqual([1]);
    expect(registry.windows('/b')).toEqual([3, 2]);

    registry.remove(1);
    expect(registry.roots()).toEqual(['/b']);
    expect(registry.root(1)).toBeUndefined();
  });
});

describe('default handler', () => {
  it('is offered only where Make Default can work', () => {
    expect(defaultHandlerPlatform('darwin', true, undefined)).toBe('darwin');
    expect(defaultHandlerPlatform('win32', true, undefined)).toBe('win32');
    expect(defaultHandlerPlatform('linux', true, undefined)).toBe('linux');
    expect(defaultHandlerPlatform('linux', true, '/home/me/seemore.AppImage')).toBeUndefined();
    expect(defaultHandlerPlatform('darwin', false, undefined)).toBeUndefined();
  });

  it('asks once, and not on a launch that opened a path', () => {
    expect(shouldOfferDefault(undefined, false)).toBe(true);
    expect(shouldOfferDefault({ asked: true }, false)).toBe(false);
    expect(shouldOfferDefault(undefined, true)).toBe(false);
    expect(shouldOfferDefault({ asked: 'yes' }, false)).toBe(true);
  });
});
