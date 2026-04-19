import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { projectNameFromCwd } from '../core/project_id.js';

const SESSION_END = 'SessionEnd';
const USER_PROMPT_SUBMIT = 'UserPromptSubmit';
const PRE_TOOL_USE = 'PreToolUse';

function absoluteBin(): string {
  // dist/cli/init.js → dist/cli/index.js (the bin entry)
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, 'index.js');
}

function somtumOnPath(): boolean {
  try {
    execFileSync('which', ['somtum'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function hookCommand(subcommand: string): string {
  if (somtumOnPath()) return `somtum ${subcommand}`;
  return `node ${absoluteBin()} ${subcommand}`;
}

const POST_SESSION_CMD = () => hookCommand('hook post_session');
const PRE_PROMPT_CMD = () => hookCommand('hook pre_prompt');
const PRE_READ_CMD = () => hookCommand('hook pre_read');

interface HookEntry {
  type: string;
  command: string;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return {};
  return JSON.parse(raw) as ClaudeSettings;
}

function hasCommand(matchers: HookMatcher[], command: string): boolean {
  return matchers.some((m) => m.hooks.some((h) => h.command === command));
}

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  withCache?: boolean;
  withFileGating?: boolean;
  withMcp?: boolean;
}

export interface InitResult {
  settingsPath: string;
  mcpPath: string | null;
  hooksInstalled: string[];
  alreadyInstalled: boolean;
  embeddingsNotice: string | null;
}

function addHook(
  settings: ClaudeSettings,
  event: string,
  command: string,
  matcher?: string,
): boolean {
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  const matchers = settings.hooks[event];
  if (hasCommand(matchers, command)) return false;
  matchers.push({
    matcher: matcher ?? '',
    hooks: [{ type: 'command', command }],
  });
  return true;
}

export function runInit(options: InitOptions = {}): InitResult {
  const cwd = options.cwd ?? process.cwd();
  const claudeDir = join(cwd, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  const settings = readSettings(settingsPath);
  const added: string[] = [];

  if (options.force) {
    if (settings.hooks) {
      for (const event of [SESSION_END, USER_PROMPT_SUBMIT, PRE_TOOL_USE]) {
        const matchers = settings.hooks[event];
        if (!matchers) continue;
        settings.hooks[event] = matchers.filter(
          (m) => !m.hooks.some((h) => h.command.includes('somtum')),
        );
      }
    }
  }

  if (addHook(settings, SESSION_END, POST_SESSION_CMD())) added.push('SessionEnd');

  if (options.withCache) {
    if (addHook(settings, USER_PROMPT_SUBMIT, PRE_PROMPT_CMD())) added.push('UserPromptSubmit');
  }
  if (options.withFileGating) {
    if (addHook(settings, PRE_TOOL_USE, PRE_READ_CMD(), 'Read|Edit')) added.push('PreToolUse(Read|Edit)');
  }

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  let mcpPath: string | null = null;
  if (options.withMcp) {
    mcpPath = writeMcpConfig(cwd);
  }

  const config = loadConfig({ cwd });
  const embeddingsNotice = config.retrieval.embeddings.enabled
    ? 'First retrieval will download a 30 MB embedding model. Disable with: somtum config set embeddings.enabled false'
    : null;

  return {
    settingsPath,
    mcpPath,
    hooksInstalled: added,
    alreadyInstalled: added.length === 0,
    embeddingsNotice,
  };
}

function writeMcpConfig(cwd: string): string {
  const mcpPath = join(cwd, '.mcp.json');
  interface McpConfig {
    mcpServers?: Record<string, { command: string; args?: string[] }>;
  }
  const existing: McpConfig = existsSync(mcpPath)
    ? (JSON.parse(readFileSync(mcpPath, 'utf8')) as McpConfig)
    : {};
  existing.mcpServers ??= {};
  if (somtumOnPath()) {
    existing.mcpServers['somtum'] = { command: 'somtum', args: ['mcp'] };
  } else {
    existing.mcpServers['somtum'] = { command: 'node', args: [absoluteBin(), 'mcp'] };
  }
  writeFileSync(mcpPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return mcpPath;
}

export function initCommand(options: {
  cwd?: string;
  force?: boolean;
  cache?: boolean;
  fileGating?: boolean;
  mcp?: boolean;
  all?: boolean;
} = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const withCache = options.all === true ? true : (options.cache ?? false);
  const withFileGating = options.all === true ? true : (options.fileGating ?? false);
  const withMcp = options.all === true ? true : (options.mcp ?? true);

  const result = runInit({
    cwd,
    force: options.force ?? false,
    withCache,
    withFileGating,
    withMcp,
  });
  const projectName = projectNameFromCwd(cwd);

  if (result.alreadyInstalled && !options.force) {
    console.log(`somtum: all requested hooks already installed in ${result.settingsPath}`);
  } else {
    console.log(`somtum: updated ${result.settingsPath}`);
    for (const h of result.hooksInstalled) console.log(`  + ${h}`);
    console.log(`  project: ${projectName}`);
  }
  if (result.mcpPath) {
    console.log(`somtum: registered MCP server in ${result.mcpPath}`);
  }
  if (result.embeddingsNotice) console.log(result.embeddingsNotice);
  return 0;
}
