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
  'content.image.zoom',
  'search.suggest',
  'search.highlight',
  'social.cards',
] as const;

export type Feature = (typeof FEATURES)[number];
/** What a user may write in `features`: a flag, or `!flag` to switch a default-on flag off. */
export type FeatureFlag = Feature | `!${Feature}`;
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
}
