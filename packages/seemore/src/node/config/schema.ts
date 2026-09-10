import { z } from 'zod';
import {
  ACTION_IDS,
  FEATURES,
  featuresFromFlags,
  type ActionId,
  type FeatureFlag,
  type FeatureMap,
  type ResolvedFeatures,
} from './features.js';

/** The CSS presets fumadocs-ui ships. We do not invent a token system. */
export const THEMES = [
  'neutral',
  'black',
  'catppuccin',
  'dusk',
  'ocean',
  'purple',
  'ruby',
  'solar',
  'aspen',
  'emerald',
  'vitepress',
  'shadcn',
] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Only the flags being changed, each set on or off. The superseded array form — bare name
 * for on, `!name` for off — is folded into the same map first rather than validated as a
 * second branch, so a bad flag is reported against one schema and names the flag.
 */
const featuresSchema = z.preprocess((input) => {
  const isFlagArray = Array.isArray(input) && input.every((flag) => typeof flag === 'string');
  return isFlagArray ? featuresFromFlags(input as FeatureFlag[]) : input;
}, z.partialRecord(z.enum(FEATURES), z.boolean()));

const navItem: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    text: z.string(),
    link: z.string().optional(),
    items: z.array(navItem).optional(),
  }),
);

export interface NavItem {
  text: string;
  link?: string;
  items?: NavItem[];
}

const searchSchema = z.union([
  z.literal('static'),
  z.object({ provider: z.literal('static') }),
  z.object({
    provider: z.literal('orama-cloud'),
    endpoint: z.string(),
    apiKey: z.string(),
  }),
  z.object({
    provider: z.literal('algolia'),
    appId: z.string(),
    apiKey: z.string(),
    indexName: z.string(),
  }),
]);

/**
 * The actions shown in the page-actions button above the article, in the order given.
 *
 * One entry per action: present means enabled, the array order is the menu order, an
 * empty array means no button at all, and a new action joins the same array. The ids are
 * seemore's own; the known set grows with the actions seemore ships.
 */
const pageActionsSchema = z.array(z.enum(ACTION_IDS)).default(['export-html']);

export const configSchema = z.object({
  /**
   * Optional here, but required whenever a config file exists — load.ts enforces that,
   * since it knows whether the config came from a file or from the no-config quickstart,
   * where the fallback is the only sensible name.
   */
  title: z.string().optional(),
  description: z.string().optional(),
  favicon: z.string().optional(),
  /** Subpath the site is served from, e.g. `/my-repo/`. Never inferred. */
  base: z.string().optional(),
  theme: z.enum(THEMES).default('neutral'),
  /** A CSS file appended after everything else, so it wins. */
  css: z.string().optional(),
  features: featuresSchema.default({}),
  nav: z.array(navItem).optional(),
  footer: z
    .object({
      text: z.string().optional(),
      links: z.array(z.object({ text: z.string(), link: z.string() })).optional(),
    })
    .optional(),
  editLink: z
    .object({
      base: z.string(),
      text: z.string().default('Edit this page'),
    })
    .optional(),
  search: searchSchema.default('static'),
  pageActions: pageActionsSchema,
  exclude: z.array(z.string()).default([]),
});

/** What a user writes in `seemore.config.ts`. */
export type SeemoreConfig = Omit<z.input<typeof configSchema>, 'features' | 'theme' | 'search'> & {
  /** An array of {@link FeatureFlag} also works, but the map is the documented form. */
  features?: FeatureMap | FeatureFlag[];
  theme?: Theme;
  search?: z.input<typeof searchSchema>;
};

export type SearchConfig =
  | { provider: 'static' }
  | { provider: 'orama-cloud'; endpoint: string; apiKey: string }
  | { provider: 'algolia'; appId: string; apiKey: string; indexName: string };

/** What the rest of seemore consumes: every optional filled in, every path absolute. */
export interface ResolvedSeemoreConfig {
  title: string;
  description?: string;
  favicon?: string;
  /** Always normalised to leading + trailing slash. */
  base: string;
  theme: Theme;
  /** Absolute path, resolved against the config file's directory. */
  css?: string;
  features: ResolvedFeatures;
  nav?: NavItem[];
  footer?: { text?: string; links?: { text: string; link: string }[] };
  editLink?: { base: string; text: string };
  search: SearchConfig;
  pageActions: ActionId[];
  exclude: string[];
  /** Directory the config was resolved from — relative paths in it hang off this. */
  root: string;
  /** Absolute path of the config file, when there is one. */
  configFile?: string;
}
