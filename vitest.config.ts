import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/bench/**'],
    environment: 'node',
    testTimeout: 10_000,
    pool: 'forks',
    benchmark: {
      include: ['test/bench/**/*.bench.ts'],
    },
  },
});
