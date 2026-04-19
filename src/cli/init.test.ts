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
    expect(settings.hooks.SessionEnd[0]?.hooks[0]?.command).toMatch(/hook post_session/);
    expect(r.hooksInstalled).toContain('SessionEnd');
  });

  it('writes MCP config when withMcp is true', () => {
    const r = runInit({ cwd: tmp, withMcp: true });
    expect(r.mcpPath).toBeTruthy();
    const mcp = JSON.parse(readFileSync(r.mcpPath!, 'utf8')) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };
    expect(mcp.mcpServers['somtum']?.args).toContain('mcp');
  });

  it('adds UserPromptSubmit hook with withCache', () => {
    const r = runInit({ cwd: tmp, withCache: true });
    const settings = JSON.parse(readFileSync(r.settingsPath, 'utf8')) as {
      hooks: { UserPromptSubmit?: { hooks: { command: string }[] }[] };
    };
    expect(settings.hooks.UserPromptSubmit?.[0]?.hooks[0]?.command).toMatch(/hook pre_prompt/);
    expect(r.hooksInstalled).toContain('UserPromptSubmit');
  });

  it('adds PreToolUse matcher with withFileGating', () => {
    const r = runInit({ cwd: tmp, withFileGating: true });
    const settings = JSON.parse(readFileSync(r.settingsPath, 'utf8')) as {
      hooks: { PreToolUse?: { matcher: string; hooks: { command: string }[] }[] };
    };
    expect(settings.hooks.PreToolUse?.[0]?.matcher).toBe('Read|Edit');
    expect(r.hooksInstalled).toContain('PreToolUse(Read|Edit)');
  });

  it('is idempotent on re-run', () => {
    runInit({ cwd: tmp });
    const r2 = runInit({ cwd: tmp });
    expect(r2.hooksInstalled).toHaveLength(0);
    expect(r2.alreadyInstalled).toBe(true);
    const settings = JSON.parse(readFileSync(r2.settingsPath, 'utf8')) as {
      hooks: { SessionEnd: { hooks: unknown[] }[] };
    };
    expect(settings.hooks.SessionEnd).toHaveLength(1);
  });

  it('force removes previous somtum hooks before reinstalling', () => {
    runInit({ cwd: tmp });
    runInit({ cwd: tmp, force: true });
    const settings = JSON.parse(readFileSync(join(tmp, '.claude', 'settings.json'), 'utf8')) as {
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
