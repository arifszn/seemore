import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createJiti } from 'jiti';
import { z } from 'zod';
import { normaliseBase } from '../base.js';
import { resolveFeatures, type FeatureFlag } from './features.js';
import { configSchema, THEMES, type SeemoreConfig, type ResolvedSeemoreConfig, type SearchConfig } from './schema.js';

const CONFIG_NAMES = ['seemore.config.ts', 'seemore.config.mts', 'seemore.config.js', 'seemore.config.mjs'];

export interface LoadConfigOptions {
  /** Directory to look in, and the base for relative paths inside the config. */
  root: string;
  /** `--config`; when given, a missing file is an error rather than a fallback to defaults. */
  configPath?: string;
}

/** Turn a validated config into the fully-resolved shape the rest of seemore consumes. */
export function resolveConfig(
  input: SeemoreConfig,
  options: { root: string; configFile?: string },
): ResolvedSeemoreConfig {
  const parsed = parseOrThrow(input, options.configFile);

  const search: SearchConfig = parsed.search === 'static' ? { provider: 'static' } : (parsed.search as SearchConfig);

  const features = resolveFeatures(parsed.features as FeatureFlag[], {
    // Nothing to link to without an edit base, so the flag follows the option.
    'content.action.edit': parsed.editLink !== undefined,
  });

  return {
    // Only reached without a config file (see parseOrThrow): 'Docs' is the best name we can know.
    title: parsed.title ?? 'Docs',
    description: parsed.description,
    favicon: parsed.favicon,
    base: normaliseBase(parsed.base),
    theme: parsed.theme,
    css: parsed.css === undefined ? undefined : resolveFrom(options.root, parsed.css),
    features,
    nav: parsed.nav,
    footer: parsed.footer,
    editLink: parsed.editLink,
    search,
    exclude: parsed.exclude,
    root: options.root,
    configFile: options.configFile,
  };
}

export interface LoadedConfig {
  config: ResolvedSeemoreConfig;
  /** Absolute path of the config file that was used, if any. */
  file?: string;
}

/**
 * Load `seemore.config.ts` with jiti. Not Vite's `ssrLoadModule`: the config
 * decides `base`, `base` configures Vite, and Vite would have to already exist to load it.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const file = findConfigFile(options);

  if (file === undefined) {
    return { config: resolveConfig({}, { root: options.root }) };
  }

  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false });
  let loaded: unknown;
  try {
    loaded = await jiti.import(file, { default: true });
  } catch (error) {
    throw new Error(`Failed to load ${file}:\n${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  if (loaded === null || typeof loaded !== 'object') {
    throw new Error(`${file} must export a config object as its default export, got ${typeof loaded}.`);
  }

  return {
    config: resolveConfig(loaded as SeemoreConfig, { root: dirname(file), configFile: file }),
    file,
  };
}

function findConfigFile({ root, configPath }: LoadConfigOptions): string | undefined {
  if (configPath !== undefined) {
    const absolute = resolveFrom(root, configPath);
    if (!existsSync(absolute)) {
      throw new Error(`Config file not found: ${absolute}`);
    }
    return absolute;
  }

  for (const name of CONFIG_NAMES) {
    const candidate = resolve(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveFrom(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function parseOrThrow(input: SeemoreConfig, file: string | undefined): z.output<typeof configSchema> {
  const result = configSchema.safeParse(input);
  if (result.success) {
    // A written config is an intentional site, so it must name itself; the no-config
    // quickstart is a preview, and falls back to 'Docs' instead.
    if (file !== undefined && result.data.title === undefined) {
      throw new Error(
        `Invalid ${file}:\n` +
          `  - title: required when a config file exists — it names the site in the header, tab, and social cards. Add: title: 'My Site'`,
      );
    }
    return result.data;
  }

  const where = file === undefined ? 'seemore config' : file;
  const issues = result.error.issues.map((issue) => {
    const field = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `  - ${field}: ${explain(issue)}`;
  });
  throw new Error(`Invalid ${where}:\n${issues.join('\n')}`);
}

function explain(issue: z.core.$ZodIssue): string {
  // zod's default message for a large enum truncates badly; the valid set is the useful part.
  if (issue.code === 'invalid_value' && issue.path.join('.') === 'theme') {
    return `unknown theme. Valid themes: ${THEMES.join(', ')}.`;
  }
  return issue.message;
}
