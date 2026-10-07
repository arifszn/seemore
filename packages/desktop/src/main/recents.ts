/** File > Open Recent and the start screen's list. Newest first, one entry per path. */

export interface RecentEntry {
  path: string;
  kind: 'file' | 'folder';
}

export const MAX_RECENTS = 10;

export function addRecent(list: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return [entry, ...list.filter((item) => item.path !== entry.path)].slice(0, MAX_RECENTS);
}

/** Reads back what `recents.json` held, dropping anything that isn't an entry. */
export function parseRecents(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is RecentEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentEntry).path === 'string' &&
        ((item as RecentEntry).kind === 'file' || (item as RecentEntry).kind === 'folder'),
    )
    .slice(0, MAX_RECENTS);
}
