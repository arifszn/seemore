import type { SeemoreConfig } from './schema.js';

/**
 * Identity function that exists purely for types: it makes `seemore.config.ts` autocomplete
 * every option — including every feature flag, which is a plain string union.
 */
export function defineConfig(config: SeemoreConfig): SeemoreConfig {
  return config;
}
