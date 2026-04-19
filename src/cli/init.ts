import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { projectNameFromCwd } from '../core/project_id.js';

const SESSION_END = 'SessionEnd';
const HOOK_COMMAND = 'npx -y somtum hook post_session';

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

function hasOurHook(matchers: HookMatcher[]): boolean {
  return matchers.some((m) => m.hooks.some((h) => h.command === HOOK_COMMAND));
}

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export interface InitResult {
  settingsPath: string;
  alreadyInstalled: boolean;
  embeddingsNotice: string | null;
}

export function runInit(options: InitOptions = {}): InitResult {
  const cwd = options.cwd ?? process.cwd();
  const claudeDir = join(cwd, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  const settings = readSettings(settingsPath);
  settings.hooks ??= {};
  settings.hooks[SESSION_END] ??= [];

  const matchers = settings.hooks[SESSION_END];
  const already = hasOurHook(matchers);
  if (!already || options.force) {
    matchers.push({
      matcher: '',
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  const config = loadConfig({ cwd });
  // When embeddings are enabled we surface the download cost up front.
  const embeddingsNotice = config.retrieval.embeddings.enabled
    ? 'First retrieval will download a 30 MB embedding model. Disable with: somtum config set embeddings.enabled false'
    : null;

  return { settingsPath, alreadyInstalled: already, embeddingsNotice };
}

export function initCommand(options: { cwd?: string; force?: boolean } = {}): number {
  const cwd = options.cwd ?? process.cwd();
  const result = runInit({ cwd, force: options.force ?? false });
  const projectName = projectNameFromCwd(cwd);

  if (result.alreadyInstalled && !options.force) {
    console.log(`somtum: SessionEnd hook already installed in ${result.settingsPath}`);
  } else {
    console.log(`somtum: installed SessionEnd hook in ${result.settingsPath}`);
    console.log(`  project: ${projectName}`);
  }
  if (result.embeddingsNotice) console.log(result.embeddingsNotice);
  return 0;
}
