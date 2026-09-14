import { useCallback, useEffect, useLayoutEffect, type ComponentProps, type ReactNode } from 'react';
import {
  SidebarFolder as BaseFolder,
  SidebarFolderContent as BaseFolderContent,
  SidebarFolderLink as BaseFolderLink,
  SidebarFolderTrigger as BaseFolderTrigger,
  SidebarItem as BaseItem,
  SidebarSeparator as BaseSeparator,
  SidebarViewport,
  useFolderDepth,
  useSidebar,
} from 'fumadocs-ui/components/sidebar/base';
import { createPageTreeRenderer } from 'fumadocs-ui/components/sidebar/page-tree';
import { useTreePath } from 'fumadocs-ui/contexts/tree';
import { usePathname } from 'fumadocs-core/framework';
import type { Folder as FolderNode } from 'fumadocs-core/page-tree';
import { feature } from '../lib/features.js';
import { useRouteUrl } from '../router.js';

/**
 * `components/sidebar/base` are behaviour-only primitives: they handle folder state, active
 * tracking and auto-scroll, and render with no classes at all. Every class is the layout's
 * to supply, which is what these wrappers do — fumadocs' own layout does the same.
 */
type ItemProps = ComponentProps<typeof BaseItem>;
type FolderLinkProps = ComponentProps<typeof BaseFolderLink>;
type FolderTriggerProps = ComponentProps<typeof BaseFolderTrigger>;
type FolderContentProps = ComponentProps<typeof BaseFolderContent>;
type SeparatorProps = ComponentProps<typeof BaseSeparator>;
type FolderProps = ComponentProps<typeof BaseFolder>;

const styled = {
  SidebarItem: (props: ItemProps) => <BaseItem {...props} className="seemore-sidebar-link" />,
  SidebarFolder: (props: FolderProps) => <BaseFolder {...props} className="seemore-sidebar-folder" />,
  SidebarFolderLink: (props: FolderLinkProps) => (
    <BaseFolderLink {...props} className="seemore-sidebar-link seemore-sidebar-folder-label" />
  ),
  // Must be a flex row: the chevron the primitive appends positions itself with `ms-auto`.
  SidebarFolderTrigger: (props: FolderTriggerProps) => (
    <BaseFolderTrigger {...props} className="seemore-sidebar-link seemore-sidebar-folder-label" />
  ),
  SidebarFolderContent: (props: FolderContentProps) => (
    <BaseFolderContent {...props} className="seemore-sidebar-folder-content" />
  ),
  SidebarSeparator: (props: SeparatorProps) => <BaseSeparator {...props} className="seemore-sidebar-separator" />,
};

const renderPageTree = createPageTreeRenderer(styled);

/** fumadocs' own active check, which it does not export: trailing slashes don't count. */
function isActive(href: string, pathname: string): boolean {
  const normalise = (url: string) => (url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url);
  return normalise(href) === normalise(pathname);
}

/**
 * `navigation.sections`: top-level folders read as headed groups rather than collapsible
 * folders. A custom `Folder` replaces fumadocs' rendering at every depth, so anything deeper
 * is rebuilt here the way fumadocs renders it — otherwise every nested folder would become an
 * uncollapsible heading too, and a large one would push the rest of the sidebar away.
 */
function SectionFolder({ item, children }: { item: FolderNode; children: ReactNode }) {
  // Depth of the folder this one sits in; 0 means it is at the top of the tree.
  const depth = useFolderDepth();
  const path = useTreePath();
  const pathname = usePathname();

  if (depth === 0) {
    return (
      <BaseFolder collapsible={false} defaultOpen className="seemore-sidebar-folder">
        <BaseSeparator className="seemore-sidebar-separator">{item.name}</BaseSeparator>
        <BaseFolderContent className="seemore-sidebar-folder-content">{children}</BaseFolderContent>
      </BaseFolder>
    );
  }

  return (
    <styled.SidebarFolder collapsible={item.collapsible} active={path.includes(item)} defaultOpen={item.defaultOpen}>
      {item.index ? (
        <styled.SidebarFolderLink
          href={item.index.url}
          active={isActive(item.index.url, pathname)}
          external={item.index.external}
        >
          {item.icon}
          {item.name}
        </styled.SidebarFolderLink>
      ) : (
        <styled.SidebarFolderTrigger>
          {item.icon}
          {item.name}
        </styled.SidebarFolderTrigger>
      )}
      <styled.SidebarFolderContent>{children}</styled.SidebarFolderContent>
    </styled.SidebarFolder>
  );
}

const COLLAPSE_KEY = 'seemore:sidebar-collapsed';
const COLLAPSE_ATTR = 'sidebarCollapsed';

/* `useLayoutEffect` does nothing on the server and says so in a warning; the prerender pass
   takes `useEffect`, which it never runs either. */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Mirrors the collapse choice onto `<html data-sidebar-collapsed>`, the attribute the blocking
 * script in `index.html` sets from `localStorage` before React ever runs. Once hydrated, this
 * component's own state is authoritative and must keep that attribute in sync — otherwise a
 * later un-collapse would leave the attribute (and the CSS rule keyed on it) stuck on `true`.
 */
function syncCollapseAttr(collapsed: boolean): void {
  if (collapsed) document.documentElement.dataset[COLLAPSE_ATTR] = 'true';
  else delete document.documentElement.dataset[COLLAPSE_ATTR];
}

/**
 * Hiding the rail is a reader's preference, like the theme, so it outlives the page rather
 * than resetting on the next load. fumadocs owns the state itself — every primitive reads
 * `collapsed` from the same context — this only teaches it to persist, and gives the header
 * a trigger to call.
 */
export function useSidebarCollapse(): { collapsed: boolean; toggle: () => void } {
  const { collapsed, setCollapsed } = useSidebar();

  const toggle = useCallback(() => {
    const next = !collapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      // Storage blocked, private window: the choice just does not outlive the page.
    }
    syncCollapseAttr(next);
    setCollapsed(next);
  }, [collapsed, setCollapsed]);

  return { collapsed, toggle };
}

/** Applied before paint, so a remembered collapse does not flash the rail open first. */
function useRestoreCollapse(): void {
  const { setCollapsed } = useSidebar();

  useIsomorphicLayoutEffect(() => {
    try {
      const restored = localStorage.getItem(COLLAPSE_KEY) === 'true';
      if (restored) setCollapsed(true);
      // Reconciles the head script's guess with the real value — clears it if storage was
      // wiped or disagrees, so a stale attribute never outlives the state it was priming.
      syncCollapseAttr(restored);
    } catch {
      // Nothing readable is nothing to restore; the rail stays open.
      syncCollapseAttr(false);
    }
  }, [setCollapsed]);
}

export function Sidebar({ children }: { children?: ReactNode }) {
  // Below `md` the sidebar is a drawer, and the header's trigger is what opens it. Without
  // reading that state the trigger is decorative: the panel is hidden by CSS alone.
  const { open, setOpen, collapsed } = useSidebar();
  const url = useRouteUrl();

  useRestoreCollapse();

  // Following a link should not leave the drawer covering the page you asked for.
  useEffect(() => {
    setOpen(false);
  }, [url, setOpen]);

  // Called during render, never inside `useMemo`: the renderer reads the tree context and
  // calls hooks of its own.
  const rendered = renderPageTree({
    Folder: feature('navigation.sections') ? SectionFolder : undefined,
  });

  return (
    <>
      {open ? (
        <button
          type="button"
          className="seemore-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : undefined}

      <div className="seemore-sidebar-column" data-open={open} data-collapsed={collapsed}>
        <aside className="seemore-sidebar" aria-label="Documentation navigation">
          {/* `toc.integrate` passes the table of contents as children: it belongs inside the
              viewport, so nav and TOC scroll together rather than the TOC sitting below a
              scroll container that has already claimed the column's whole height. */}
          <SidebarViewport>
            {rendered}
            {children}
          </SidebarViewport>
        </aside>
      </div>
    </>
  );
}
