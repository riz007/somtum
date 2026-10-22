import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexInit } from './init_codex.js';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'somtum-codex-init-'));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function hooks(): Record<string, { hooks: { command: string }[] }[]> {
  return JSON.parse(readFileSync(join(cwd, '.codex', 'hooks.json'), 'utf8')).hooks;
}

describe('runCodexInit', () => {
  it('installs capture and injection hooks and the MCP server', () => {
    const r = runCodexInit({ cwd });
    expect(r.hooksInstalled).toEqual(['SessionEnd', 'PreCompact', 'UserPromptSubmit']);
    expect(hooks()['SessionEnd']?.[0]?.hooks[0]?.command).toMatch(/hook post_session$/);
    expect(hooks()['UserPromptSubmit']?.[0]?.hooks[0]?.command).toMatch(/hook pre_prompt$/);

    const toml = readFileSync(join(cwd, '.codex', 'config.toml'), 'utf8');
    expect(toml).toContain('[mcp_servers.somtum]');
    expect(toml).toMatch(/args = \[.*"mcp"\]/);
  });

  it('is idempotent', () => {
    runCodexInit({ cwd });
    const again = runCodexInit({ cwd });
    expect(again.hooksInstalled).toEqual([]);
    expect(hooks()['SessionEnd']).toHaveLength(1);
    const toml = readFileSync(join(cwd, '.codex', 'config.toml'), 'utf8');
    expect(toml.match(/\[mcp_servers\.somtum\]/g)).toHaveLength(1);
  });

  it('keeps existing config and hooks', () => {
    mkdirSync(join(cwd, '.codex'));
    writeFileSync(join(cwd, '.codex', 'config.toml'), 'model = "gpt-5.5"');
    writeFileSync(
      join(cwd, '.codex', 'hooks.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify' }] }] } }),
    );

    runCodexInit({ cwd });

    const toml = readFileSync(join(cwd, '.codex', 'config.toml'), 'utf8');
    expect(toml.startsWith('model = "gpt-5.5"\n\n[mcp_servers.somtum]')).toBe(true);
    expect(hooks()['Stop']?.[0]?.hooks[0]?.command).toBe('notify');
  });

  it('skips MCP registration when asked', () => {
    expect(runCodexInit({ cwd, withMcp: false }).configPath).toBeNull();
  });
});
