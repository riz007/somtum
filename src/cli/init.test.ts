import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from './init.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-init-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('runInit', () => {
  it('creates .claude/settings.json with the SessionEnd hook', () => {
    const r = runInit({ cwd: tmp });
    const settings = JSON.parse(readFileSync(r.settingsPath, 'utf8')) as {
      hooks: { SessionEnd: { hooks: { command: string }[] }[] };
    };
    expect(settings.hooks.SessionEnd[0]?.hooks[0]?.command).toMatch(/somtum hook post_session/);
    expect(r.alreadyInstalled).toBe(false);
  });

  it('is idempotent on re-run', () => {
    runInit({ cwd: tmp });
    const r2 = runInit({ cwd: tmp });
    expect(r2.alreadyInstalled).toBe(true);
    const settings = JSON.parse(readFileSync(r2.settingsPath, 'utf8')) as {
      hooks: { SessionEnd: { hooks: unknown[] }[] };
    };
    expect(settings.hooks.SessionEnd).toHaveLength(1);
  });

  it('merges with an existing settings.json without clobbering other keys', () => {
    mkdirSync(join(tmp, '.claude'));
    writeFileSync(
      join(tmp, '.claude', 'settings.json'),
      JSON.stringify(
        {
          permissions: { allow: ['Bash(ls)'] },
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
          },
        },
        null,
        2,
      ),
    );
    runInit({ cwd: tmp });
    const settings = JSON.parse(
      readFileSync(join(tmp, '.claude', 'settings.json'), 'utf8'),
    ) as {
      permissions: { allow: string[] };
      hooks: { PreToolUse: unknown[]; SessionEnd: unknown[] };
    };
    expect(settings.permissions.allow).toContain('Bash(ls)');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.SessionEnd).toHaveLength(1);
  });
});
