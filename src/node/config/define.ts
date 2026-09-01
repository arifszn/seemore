import type { OpenmdConfig } from './schema.js';

/**
 * Identity function that exists purely for types: it makes `openmd.config.ts` autocomplete
 * every option — including every feature flag, which is a plain string union.
 */
export function defineConfig(config: OpenmdConfig): OpenmdConfig {
  return config;
}
