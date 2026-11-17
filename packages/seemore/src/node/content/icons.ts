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
const aliases = lucide as unknown as Record<string, IconComponent | undefined>;

function resolveIcon(name: string): ReactElement | undefined {
  const icon = (lucide.icons as Record<string, IconComponent | undefined>)[name] ?? aliasFor(name);
  if (icon === undefined) {
    console.warn(`[seemore] Unknown icon "${name}": use a lucide icon name, such as BookOpen.`);
    return undefined;
  }
  return createElement(icon);
}

/** Icon exports are PascalCase; the module's other exports (`icons`, `createLucideIcon`) are not. */
function aliasFor(name: string): IconComponent | undefined {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return undefined;
  return aliases[name];
}
