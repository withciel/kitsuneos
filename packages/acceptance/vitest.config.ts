import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
  },
});
