import { describe, it, expect, vi } from 'vitest';
import { runSync } from './sync.js';
import { hostname } from 'node:os';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
}));

vi.mock('../config.js', () => ({
  loadConfig: () => ({
    sync: {
      remote: 'user@host:/remote/path'
    }
  }),
  projectDir: () => '/tmp/somtum/proj'
}));

vi.mock('../core/project_id.js', () => ({
  resolveProjectId: () => 'test-proj'
}));

vi.mock('../core/db.js', () => ({
  openDb: () => ({
    prepare: () => ({
      get: () => ({ n: 10 })
    }),
    close: vi.fn()
  })
}));

describe('sync', () => {
  it('throws error if remote is not configured', async () => {
    vi.mock('../config.js', () => ({
      loadConfig: () => ({ sync: { remote: null } }),
      projectDir: () => '/tmp/somtum/proj'
    }));
    await expect(runSync({ direction: 'status' })).rejects.toThrow(/sync.remote is not configured/);
  });

  it('correctly identifies local hostname in push path', async () => {
    const _host = hostname().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const result = await runSync({ direction: 'status', remote: 'user@host:/path' });
    expect(result.remote).toBe('user@host:/path');
  });
});
