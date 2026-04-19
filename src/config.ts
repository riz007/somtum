import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigSchema, type Config, type ConfigInput } from './core/schema.js';

export const GLOBAL_DIR = process.env['SOMTUM_HOME'] ?? join(homedir(), '.somtum');
export const GLOBAL_CONFIG_PATH = join(GLOBAL_DIR, 'config.json');
export const PROJECT_CONFIG_RELATIVE = join('.somtum', 'config.json');

function readJsonIfExists(path: string): unknown {
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return undefined;
  return JSON.parse(raw);
}

function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (
    typeof base !== 'object' ||
    base === null ||
    Array.isArray(base) ||
    typeof over !== 'object' ||
    Array.isArray(over)
  ) {
    return over as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}

export interface LoadOptions {
  cwd?: string;
  global?: string;
}

export function loadConfig(options: LoadOptions = {}): Config {
  const cwd = options.cwd ?? process.cwd();
  const globalPath = options.global ?? GLOBAL_CONFIG_PATH;

  const globalRaw = (readJsonIfExists(globalPath) ?? {}) as ConfigInput;
  const projectRaw = (readJsonIfExists(join(cwd, PROJECT_CONFIG_RELATIVE)) ??
    {}) as ConfigInput;

  const merged = deepMerge<ConfigInput>(globalRaw, projectRaw);
  return ConfigSchema.parse(merged);
}

export function ensureGlobalDir(): string {
  if (!existsSync(GLOBAL_DIR)) {
    mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  return GLOBAL_DIR;
}

export function projectDir(projectId: string): string {
  const dir = join(GLOBAL_DIR, 'projects', projectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
