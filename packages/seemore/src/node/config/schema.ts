import { z } from 'zod';
import { FEATURES, type FeatureFlag, type ResolvedFeatures } from './features.js';

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

const featureFlag = z.enum([...FEATURES, ...FEATURES.map((f) => `!${f}` as const)] as [string, ...string[]]);

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

export const configSchema = z.object({
  title: z.string().default('Documentation'),
  description: z.string().optional(),
  favicon: z.string().optional(),
  /** Subpath the site is served from, e.g. `/my-repo/`. Never inferred. */
  base: z.string().optional(),
  theme: z.enum(THEMES).default('neutral'),
  /** A CSS file appended after everything else, so it wins. */
  css: z.string().optional(),
  features: z.array(featureFlag).default([]),
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
  exclude: z.array(z.string()).default([]),
});

/** What a user writes in `seemore.config.ts`. */
export type SeemoreConfig = Omit<z.input<typeof configSchema>, 'features' | 'theme' | 'search'> & {
  features?: FeatureFlag[];
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
  exclude: string[];
  /** Directory the config was resolved from — relative paths in it hang off this. */
  root: string;
  /** Absolute path of the config file, when there is one. */
  configFile?: string;
}
