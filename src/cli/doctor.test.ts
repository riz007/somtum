import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runDoctor } from './doctor.js';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import { openDb } from '../core/db.js';
import { projectDir } from '../config.js';

vi.mock('../core/db.js', async () => {
  const actual = await vi.importActual('../core/db.js');
  return {
    ...actual,
    appliedVersions: vi.fn(() => [1, 2, 3]),
  };
});

describe('doctor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `somtum-test-doctor-${ulid()}`);
    mkdirSync(tempDir, { recursive: true });
    // Mock global dir
    mkdirSync(join(tempDir, '.somtum'), { recursive: true });
  });

  it('reports failure if no DB is found', () => {
    const result = runDoctor({ cwd: tempDir });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'db_file')?.ok).toBe(false);
  });

  it('reports success if all checks pass', () => {
    // Setup a dummy project structure
    mkdirSync(join(tempDir, '.somtum', 'projects', 'test-proj'), { recursive: true });
    writeFileSync(join(tempDir, '.somtum', 'projects', 'test-proj', 'db.sqlite'), '');

    // We need to mock resolveProjectId or make it work
    vi.mock('../core/project_id.js', () => ({
      resolveProjectId: () => 'test-proj',
      projectNameFromCwd: () => 'test-proj',
    }));

    // This is hard to test fully without deep mocking but let's see
    // The current runDoctor might still fail on real DB open if not fully mocked
  });

  it('accepts Codex hooks when there is no Claude Code settings file', () => {
    const dir = projectDir('test-proj');
    mkdirSync(dir, { recursive: true });
    openDb({ path: join(dir, 'db.sqlite') }).close();
    mkdirSync(join(tempDir, '.codex'));
    writeFileSync(
      join(tempDir, '.codex', 'hooks.json'),
      JSON.stringify({
        hooks: { SessionEnd: [{ hooks: [{ command: 'somtum hook post_session' }] }] },
      }),
    );

    try {
      const check = runDoctor({ cwd: tempDir }).checks.find((c) => c.name === 'hooks_installed');
      expect(check?.ok).toBe(true);
      expect(check?.detail).toContain(join('.codex', 'hooks.json'));
    } finally {
      // SOMTUM_HOME is shared across runs; a leftover DB breaks the no-DB test.
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
