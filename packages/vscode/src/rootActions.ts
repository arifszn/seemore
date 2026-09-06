/**
 * The actions behind the status bar item — pin the live root, clear a pin, pick a folder.
 *
 * Split out as a pure function so the "which actions apply right now" decision is unit
 * testable without a `vscode` module: `session.ts` only turns these into a QuickPick and
 * dispatches on what came back.
 *
 * Clearing matters as much as pinning. A pin beats every other signal in `root.ts`, so a
 * stale one silently sends every future click to the wrong root — files outside it render
 * nothing, with a 404 that talks about `exclude` and duplicate slugs rather than the root.
 * Without a clear action the only escape is pinning somewhere else.
 */
export type RootAction = 'pin' | 'unpin' | 'choose';

export interface RootActionItem {
  action: RootAction;
  label: string;
  detail: string;
}

export interface RootActionsState {
  /** The root the running server was started on, if one is running. */
  liveRoot?: string;
  /** The root pinned for this workspace, if any. */
  pinned?: string;
}

export function rootActionItems(state: RootActionsState): RootActionItem[] {
  const items: RootActionItem[] = [];

  // Nothing to pin when no server is running, and nothing to change when the live root is
  // already the pin.
  if (state.liveRoot !== undefined && state.pinned !== state.liveRoot) {
    items.push({
      action: 'pin',
      label: 'Pin this folder',
      detail: `Always serve ${state.liveRoot}, instead of re-resolving a root from the clicked file.`,
    });
  }

  if (state.pinned !== undefined) {
    items.push({
      action: 'unpin',
      label: 'Clear pinned root',
      detail: `Stop always serving ${state.pinned}; go back to resolving a root from the clicked file.`,
    });
  }

  // "another"/"different" only make sense against a folder the reader can already see. With
  // no server running and nothing pinned — the palette's cold-start case — there is none.
  const anchored = state.liveRoot !== undefined || state.pinned !== undefined;
  items.push({
    action: 'choose',
    label: anchored ? 'Choose another folder…' : 'Choose a folder…',
    detail: anchored
      ? 'Render a different folder as the site, and pin it as the root.'
      : 'Render a folder as the site, and pin it as the root.',
  });

  return items;
}
