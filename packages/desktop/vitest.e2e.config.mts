import { defineConfig } from 'vitest/config';

/**
 * The built app driven through Playwright's Electron support. Needs `dist/` (the script
 * builds it) and a staged CLI, which `tests/e2e/stage.ts` refreshes when it is missing or stale.
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    globalSetup: ['tests/e2e/stage.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
