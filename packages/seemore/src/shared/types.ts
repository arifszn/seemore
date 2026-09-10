import type { ComponentType, ReactNode } from 'react';

/**
 * Types shared by the node pipeline and the browser app. This file ships as source, next to
 * `src/app`, so both halves agree on the shape of the virtual modules.
 */

export const FEATURES = [
  'navigation.instant.prefetch',
  'navigation.instant.preview',
  'navigation.footer',
  'navigation.top',
  'navigation.path',
  'navigation.sections',
  'navigation.prune',
  'toc.follow',
  'toc.integrate',
  'content.code.copy',
  'content.action.edit',
  'content.edit',
  'content.image.zoom',
  'search.suggest',
  'search.highlight',
  'social.cards',
] as const;

export type Feature = (typeof FEATURES)[number];
/** What a user writes in `features`: the flags they are changing, each set on or off. */
export type FeatureMap = Partial<Record<Feature, boolean>>;
/** @deprecated The array form, where a `!` prefix means off. Write {@link FeatureMap} instead. */
export type FeatureFlag = Feature | `!${Feature}`;
export type FeaturesInput = FeatureMap | readonly FeatureFlag[];
export type ResolvedFeatures = Record<Feature, boolean>;

export interface NavItem {
  text: string;
  link?: string;
  items?: NavItem[];
}

export type ClientSearchConfig =
  | { provider: 'static'; from: string }
  | { provider: 'orama-cloud'; endpoint: string; apiKey: string }
  | { provider: 'algolia'; appId: string; apiKey: string; indexName: string };

/** The payload of `virtual:seemore/config`. */
/**
 * The actions a page-actions button can hold, by id. Presence in the `actions` array is
 * what enables an action; the array order is the menu order.
 */
export const ACTION_IDS = ['copy-markdown', 'export-html'] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export interface ClientConfig {
  title: string;
  description?: string;
  base: string;
  theme: string;
  features: ResolvedFeatures;
  nav?: NavItem[];
  footer?: { text?: string; links?: { text: string; link: string }[] };
  editLink?: { base: string; text: string };
  favicon?: string;
  pageActions: ActionId[];
  search: ClientSearchConfig;
  contentRoot: string;
}

/** One entry of `virtual:seemore/routes`. */
export interface RouteEntry {
  url: string;
  /** Virtual path relative to the content root — what an edit link points at. */
  file: string;
  absPath: string;
  title: string;
  description: string | null;
  /** Content hash; a new value means `load()` now resolves to a different module. */
  version: string;
  load: () => Promise<PageModule>;
}

export interface TocEntry {
  title: ReactNode;
  url: string;
  depth: number;
}

export interface PageModule {
  default: ComponentType<{ components?: Record<string, unknown> }>;
  /** Exported by fumadocs' `rehype-toc`. */
  toc?: TocEntry[];
  /** The page as Markdown, written at compile time by `remark-llms`. */
  _markdown?: string;
}
