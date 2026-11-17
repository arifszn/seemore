import { createElement, type ReactElement } from 'react';
import * as lucide from 'lucide-react';
import type { LoaderPlugin } from 'fumadocs-core/source';
import type * as PageTree from 'fumadocs-core/page-tree';

/**
 * Frontmatter `icon` names to lucide icons in the page tree, like fumadocs'
 * `lucideIconsPlugin`, but also accepting lucide's renamed icons. lucide keeps a renamed
 * icon (`History`, now `RotateCcwClock`) only as an alias export, not in its `icons` map, and
 * fumadocs looks in the map alone.
 */
export function iconsPlugin(): LoaderPlugin {
  function replaceIcon<T extends PageTree.Item | PageTree.Folder | PageTree.Separator>(node: T): T {
    if (typeof node.icon === 'string') node.icon = resolveIcon(node.icon);
    return node;
  }

  return {
    name: 'seemore:icons',
    transformPageTree: { file: replaceIcon, folder: replaceIcon, separator: replaceIcon },
  };
}

type IconComponent = Parameters<typeof createElement>[0];
const icons = lucide.icons as Record<string, IconComponent | undefined>;
const exports = lucide as unknown as Record<string, IconComponent | undefined>;
/** Every icon, by identity: an alias export is the same component as its canonical icon. */
const iconComponents = new Set(Object.values(icons));

function resolveIcon(name: string): ReactElement | undefined {
  const icon = (Object.hasOwn(icons, name) ? icons[name] : undefined) ?? aliasFor(name);
  if (icon === undefined) {
    console.warn(`[seemore] Unknown icon "${name}": use a lucide icon name, such as BookOpen.`);
    return undefined;
  }
  return createElement(icon);
}

/**
 * An export that is one of the icons. Other exports, PascalCase ones included (`Icon`,
 * `LucideProvider`), are not, and resolve to nothing.
 */
function aliasFor(name: string): IconComponent | undefined {
  const component = Object.hasOwn(exports, name) ? exports[name] : undefined;
  return component !== undefined && iconComponents.has(component) ? component : undefined;
}
