import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
  SidebarSeparator,
  SidebarViewport,
} from 'fumadocs-ui/components/sidebar/base';
import { createPageTreeRenderer } from 'fumadocs-ui/components/sidebar/page-tree';
import { feature } from '../lib/features.js';

const renderPageTree = createPageTreeRenderer({
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarSeparator,
  SidebarItem,
});

export function Sidebar() {
  // Called during render, never inside `useMemo`: the renderer reads the tree context and
  // calls hooks of its own.
  const rendered = renderPageTree({
    Folder: feature('navigation.sections')
      ? ({ item, children }) => (
          // Top-level entries read as headed groups rather than collapsible folders.
          <SidebarFolder collapsible={false} defaultOpen>
            <SidebarSeparator>{item.name}</SidebarSeparator>
            <SidebarFolderContent>{children}</SidebarFolderContent>
          </SidebarFolder>
        )
      : undefined,
  });

  return (
    <aside className="openmd-sidebar" aria-label="Documentation navigation">
      <SidebarViewport>{rendered}</SidebarViewport>
    </aside>
  );
}
