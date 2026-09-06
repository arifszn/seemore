import { describe, expect, it } from 'vitest';
import { type RootAction, rootActionItems } from '../src/rootActions.js';

const actions = (state: Parameters<typeof rootActionItems>[0]): RootAction[] =>
  rootActionItems(state).map((item) => item.action);

describe('rootActionItems', () => {
  it('offers choosing a folder even with no server running and no pin', () => {
    expect(actions({})).toEqual(['choose']);
  });

  it('offers pinning the live root when it is not already the pin', () => {
    expect(actions({ liveRoot: '/repo/docs' })).toEqual(['pin', 'choose']);
  });

  it('does not offer pinning a live root that is already pinned', () => {
    expect(actions({ liveRoot: '/repo/docs', pinned: '/repo/docs' })).toEqual(['unpin', 'choose']);
  });

  it('offers both when the pin and the live root disagree', () => {
    expect(actions({ liveRoot: '/repo/docs', pinned: '/repo/site' })).toEqual(['pin', 'unpin', 'choose']);
  });

  it('offers clearing a stale pin with no server running — the only way out of a bad pin', () => {
    expect(actions({ pinned: '/repo/site' })).toEqual(['unpin', 'choose']);
  });

  it('does not say "another folder" when there is no current folder to contrast with', () => {
    const [choose] = rootActionItems({});
    expect(choose?.label).toBe('Choose a folder…');
    expect(choose?.detail).not.toContain('different');
  });

  it('says "another folder" once something is being served or pinned', () => {
    expect(rootActionItems({ liveRoot: '/repo/docs' })[1]?.label).toBe('Choose another folder…');
    expect(rootActionItems({ pinned: '/repo/site' })[1]?.label).toBe('Choose another folder…');
  });

  it('names the folder each action applies to, so the effect is visible before choosing', () => {
    const items = rootActionItems({ liveRoot: '/repo/docs', pinned: '/repo/site' });
    expect(items[0]?.detail).toContain('/repo/docs');
    expect(items[1]?.detail).toContain('/repo/site');
  });
});
