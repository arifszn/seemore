import { describe, expect, it } from 'vitest';
import { createPinnedRootStore } from '../src/pinnedRoot.js';

/** A minimal fake of the one slice of `vscode.Memento` this module uses. */
function fakeMemento() {
  const store = new Map<string, unknown>();
  return {
    memento: {
      get: <T>(key: string, defaultValue?: T) => (store.has(key) ? (store.get(key) as T) : defaultValue),
      update: (key: string, value: unknown) => {
        if (value === undefined) store.delete(key);
        else store.set(key, value);
        return Promise.resolve();
      },
    },
    store,
  };
}

describe('createPinnedRootStore', () => {
  it('returns undefined when nothing has been pinned', () => {
    const { memento } = fakeMemento();
    expect(createPinnedRootStore(memento).get()).toBeUndefined();
  });

  it('round-trips a pinned root', async () => {
    const { memento } = fakeMemento();
    const pinned = createPinnedRootStore(memento);
    await pinned.set('/repo/docs');
    expect(pinned.get()).toBe('/repo/docs');
  });

  it('clears the pin when set to undefined — the widen undo path', async () => {
    const { memento } = fakeMemento();
    const pinned = createPinnedRootStore(memento);
    await pinned.set('/repo/docs');
    await pinned.set(undefined);
    expect(pinned.get()).toBeUndefined();
  });

  it('keys the pin separately from other workspaceState entries', async () => {
    const { memento, store } = fakeMemento();
    const pinned = createPinnedRootStore(memento);
    await pinned.set('/repo/docs');
    expect([...store.keys()]).toEqual(['seemore.pinnedRoot']);
  });
});
