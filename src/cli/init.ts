import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { projectNameFromCwd } from '../core/project_id.js';

const SESSION_END = 'SessionEnd';
const PRE_COMPACT = 'PreCompact';
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

function claudeInPath(): boolean {
  try {
    execFileSync('which', ['claude'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function keyInProfile(): boolean {
  const home = homedir();
  const profiles = [join(home, '.zshrc'), join(home, '.bashrc'), join(home, '.profile')];
  for (const f of profiles) {
    try {
      if (existsSync(f) && readFileSync(f, 'utf8').includes('ANTHROPIC_API_KEY')) return true;
    } catch {
      // unreadable profile — skip
    }
  }
  return false;
}

// FIX-07: detect whether cwd looks like a project root.
const PROJECT_ROOT_INDICATORS = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', '.git'];

function isProjectRoot(cwd: string): boolean {
  return PROJECT_ROOT_INDICATORS.some((ind) => existsSync(join(cwd, ind)));
}

async function promptContinue(message: string): Promise<void> {
  process.stderr.write(message);
  if (!process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  await new Promise<void>((resolve) => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
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
      for (const event of [SESSION_END, PRE_COMPACT, USER_PROMPT_SUBMIT, PRE_TOOL_USE]) {
        const matchers = settings.hooks[event];
        if (!matchers) continue;
        settings.hooks[event] = matchers.filter(
          (m) => !m.hooks.some((h) => h.command.includes('somtum')),
        );
      }
    }
  }

  // SessionEnd: extract observations + populate cache entries.
  if (addHook(settings, SESSION_END, POST_SESSION_CMD())) added.push('SessionEnd');

  // PreCompact: same pipeline, plus writes a warm-start file so the next
  // UserPromptSubmit hook can restore context after compaction.
  if (addHook(settings, PRE_COMPACT, POST_SESSION_CMD())) added.push('PreCompact');

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

export async function initCommand(options: {
  cwd?: string;
  force?: boolean;
  yes?: boolean;
  cache?: boolean;
  fileGating?: boolean;
  mcp?: boolean;
  all?: boolean;
} = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const yes = options.yes ?? options.force ?? false;

  // FIX-07: warn when run from outside a project root.
  if (!isProjectRoot(cwd) && !yes) {
    await promptContinue(
      [
        '',
        'NOTICE: No project root indicators found in the current directory.',
        `  (checked for: ${PROJECT_ROOT_INDICATORS.join(', ')})`,
        '',
        'Somtum works best when initialized from the root of the project you open',
        'with Claude Code. If you launch Claude Code from a different directory,',
        'it will read a different settings.json and the hooks will not fire.',
        '',
        `Current directory: ${cwd}`,
        '',
        'If this is intentional, continue. Otherwise, cd to your project root first.',
        'Press Enter to continue or Ctrl+C to cancel.',
        '',
      ].join('\n'),
    );
  }

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

  // FIX-01: warn when no extraction backend is available.
  const apiKeySet = !!(process.env['ANTHROPIC_API_KEY']?.trim());
  const hasClaude = claudeInPath();
  if (!apiKeySet && !hasClaude) {
    process.stderr.write(
      [
        '',
        'WARNING: No extraction backend found.',
        '',
        '  Claude CLI:        not found in PATH',
        '  ANTHROPIC_API_KEY: not set',
        '',
        'Somtum cannot extract memories without at least one of these.',
        '',
        'To fix:',
        '  Option A — Confirm Claude Code is installed: which claude',
        '  Option B — Add your API key to ~/.zshrc:',
        '             export ANTHROPIC_API_KEY="sk-ant-..."',
        '             source ~/.zshrc',
        '',
        'Run `somtum doctor` after fixing to confirm.',
        '',
      ].join('\n'),
    );
  }

  // FIX-02: warn when the key is in the env but not in any shell profile.
  if (apiKeySet && !keyInProfile()) {
    process.stderr.write(
      [
        '',
        'NOTICE: ANTHROPIC_API_KEY is set in this terminal session but was not found',
        'in your shell profile (~/.zshrc or ~/.bashrc).',
        '',
        'The SessionEnd hook runs as a subprocess and will not inherit a key that is',
        'only exported in an open terminal tab.',
        '',
        'To fix, add the following to ~/.zshrc (or ~/.bashrc):',
        '  export ANTHROPIC_API_KEY="sk-ant-..."',
        '',
        'Then run:',
        '  source ~/.zshrc',
        '',
      ].join('\n'),
    );
  }

  return 0;
}
