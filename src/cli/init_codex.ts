import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { absoluteBin, addHook, hookCommand, readSettings, somtumOnPath } from './init.js';

// Codex reads hooks from <repo>/.codex/hooks.json in the same shape Claude
// Code uses in settings.json, with the same event names and stdin payloads,
// so the existing hook handlers serve both agents.
const SOMTUM_EVENTS = ['SessionEnd', 'PreCompact', 'UserPromptSubmit'];

export interface CodexInitOptions {
  cwd: string;
  force?: boolean;
  withMcp?: boolean;
}

export interface CodexInitResult {
  hooksPath: string;
  configPath: string | null;
  hooksInstalled: string[];
}

export function runCodexInit({
  cwd,
  force = false,
  withMcp = true,
}: CodexInitOptions): CodexInitResult {
  const codexDir = join(cwd, '.codex');
  if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });

  const hooksPath = join(codexDir, 'hooks.json');
  const settings = readSettings(hooksPath);

  if (force && settings.hooks) {
    for (const event of SOMTUM_EVENTS) {
      const matchers = settings.hooks[event];
      if (!matchers) continue;
      settings.hooks[event] = matchers.filter(
        (m) => !m.hooks.some((h) => h.command.includes('somtum')),
      );
    }
  }

  const postSession = hookCommand('hook post_session');
  const added: string[] = [];
  if (addHook(settings, 'SessionEnd', postSession)) added.push('SessionEnd');
  if (addHook(settings, 'PreCompact', postSession)) added.push('PreCompact');
  // Unlike the Claude Code install, injection is on by default: recalling
  // memories on each prompt is what makes the captured ones useful.
  if (addHook(settings, 'UserPromptSubmit', hookCommand('hook pre_prompt'))) {
    added.push('UserPromptSubmit');
  }
  writeFileSync(hooksPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  const configPath = withMcp ? registerMcpServer(join(codexDir, 'config.toml')) : null;
  return { hooksPath, configPath, hooksInstalled: added };
}

// Appends an [mcp_servers.somtum] table unless one exists. No TOML parser:
// we only ever add a whole table, never edit someone else's.
function registerMcpServer(configPath: string): string {
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  if (/^\[mcp_servers\.somtum\]/m.test(existing)) return configPath;

  const [command, args] = somtumOnPath() ? ['somtum', ['mcp']] : ['node', [absoluteBin(), 'mcp']];
  const table = [
    '[mcp_servers.somtum]',
    `command = ${JSON.stringify(command)}`,
    `args = [${args.map((a) => JSON.stringify(a)).join(', ')}]`,
  ].join('\n');

  const sep = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(configPath, `${existing}${sep}${table}\n`, 'utf8');
  return configPath;
}
