import { createLinkResolver, type LinkResolver } from './content/links.js';
import type { ContentPage, ScanResult } from './content/scan.js';
import { createSource, type OpenmdSource } from './content/source.js';
import type { ResolvedOpenmdConfig } from './config/schema.js';
import { createWarningCollector, type WarningCollector } from './report.js';

export interface OpenmdContext {
  config: ResolvedOpenmdConfig;
  /** Absolute path of the directory being documented. Usually outside the Vite root. */
  contentRoot: string;
  source: OpenmdSource;
  warnings: WarningCollector;
  pages(): ContentPage[];
  /** Rebuilt on every refresh, so remark plugins must read it late. */
  resolver(): LinkResolver;
  /** Re-read the corpus after a filesystem change. */
  refresh(): ScanResult;
  /** Slug collisions and frontmatter failures found by the most recent scan. */
  errors(): string[];
}

export interface CreateContextOptions {
  config: ResolvedOpenmdConfig;
  contentRoot: string;
  /** Dev keeps drafts so they can be written; the build drops them. */
  includeDrafts?: boolean;
}

export function createContext(options: CreateContextOptions): OpenmdContext {
  const { config, contentRoot } = options;

  const source = createSource({
    contentRoot,
    exclude: config.exclude,
    siteTitle: config.title,
    includeDrafts: options.includeDrafts,
  });

  let resolver = createLinkResolver(source.pages(), config.base);

  return {
    config,
    contentRoot,
    source,
    warnings: createWarningCollector(),
    pages: () => source.pages(),
    resolver: () => resolver,
    errors: () => source.current().errors,
    refresh() {
      const result = source.refresh();
      resolver = createLinkResolver(result.pages, config.base);
      return result;
    },
  };
}
