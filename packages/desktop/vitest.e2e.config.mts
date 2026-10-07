import { defineConfig } from 'vitest/config';

/**
 * The built app driven through Playwright's Electron support. Needs `dist/` (the script
 * builds it) and a staged CLI (`pnpm stage`).
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
