import { useEffect, type ComponentProps, type ReactNode } from 'react';
import {
  SidebarFolder as BaseFolder,
  SidebarFolderContent as BaseFolderContent,
  SidebarFolderLink as BaseFolderLink,
  SidebarFolderTrigger as BaseFolderTrigger,
  SidebarItem as BaseItem,
  SidebarSeparator as BaseSeparator,
  SidebarViewport,
  useSidebar,
} from 'fumadocs-ui/components/sidebar/base';
import { createPageTreeRenderer } from 'fumadocs-ui/components/sidebar/page-tree';
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
  SidebarItem: (props: ItemProps) => <BaseItem {...props} className="openmd-sidebar-link" />,
  SidebarFolder: (props: FolderProps) => <BaseFolder {...props} className="openmd-sidebar-folder" />,
  SidebarFolderLink: (props: FolderLinkProps) => (
    <BaseFolderLink {...props} className="openmd-sidebar-link openmd-sidebar-folder-label" />
  ),
  // Must be a flex row: the chevron the primitive appends positions itself with `ms-auto`.
  SidebarFolderTrigger: (props: FolderTriggerProps) => (
    <BaseFolderTrigger {...props} className="openmd-sidebar-link openmd-sidebar-folder-label" />
  ),
  SidebarFolderContent: (props: FolderContentProps) => (
    <BaseFolderContent {...props} className="openmd-sidebar-folder-content" />
  ),
  SidebarSeparator: (props: SeparatorProps) => <BaseSeparator {...props} className="openmd-sidebar-separator" />,
};

const renderPageTree = createPageTreeRenderer(styled);

export function Sidebar({ children }: { children?: ReactNode }) {
  // Below `md` the sidebar is a drawer, and the header's trigger is what opens it. Without
  // reading that state the trigger is decorative: the panel is hidden by CSS alone.
  const { open, setOpen } = useSidebar();
  const url = useRouteUrl();

  // Following a link should not leave the drawer covering the page you asked for.
  useEffect(() => {
    setOpen(false);
  }, [url, setOpen]);

  // Called during render, never inside `useMemo`: the renderer reads the tree context and
  // calls hooks of its own.
  const rendered = renderPageTree({
    Folder: feature('navigation.sections')
      ? ({ item, children }) => (
          // Top-level entries read as headed groups rather than collapsible folders.
          <BaseFolder collapsible={false} defaultOpen className="openmd-sidebar-folder">
            <BaseSeparator className="openmd-sidebar-separator">{item.name}</BaseSeparator>
            <BaseFolderContent className="openmd-sidebar-folder-content">{children}</BaseFolderContent>
          </BaseFolder>
        )
      : undefined,
  });

  return (
    <>
      {open ? (
        <button
          type="button"
          className="openmd-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : undefined}

      <div className="openmd-sidebar-column" data-open={open}>
        <aside className="openmd-sidebar" aria-label="Documentation navigation">
          <SidebarViewport>{rendered}</SidebarViewport>
        </aside>
        {children}
      </div>
    </>
  );
}
