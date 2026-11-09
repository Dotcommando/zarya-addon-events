import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    globals: true,
    testTimeout: 20000,
    fileParallelism: false,
  },
});
