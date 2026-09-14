import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `src/app` is browser code; its non-relative imports are the plugin-generated route and
  // tree stores, which a Node test has no server to produce.
  resolve: {
    alias: {
      'virtual:seemore/routes': fileURLToPath(new URL('./tests/stubs/routes.ts', import.meta.url)),
      'virtual:seemore/tree': fileURLToPath(new URL('./tests/stubs/tree.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
