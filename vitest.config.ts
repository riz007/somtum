import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/bench/**'],
    environment: 'node',
    testTimeout: 10_000,
    pool: 'forks',
    // Keep tests away from the developer's real ~/.somtum (global.db, session
    // state, hook.log). Config reads SOMTUM_HOME at module load, so it must be
    // set before any worker imports src/config.ts.
    env: {
      SOMTUM_HOME: join(tmpdir(), 'somtum-vitest-home'),
    },
    benchmark: {
      include: ['test/bench/**/*.bench.ts'],
    },
  },
});
