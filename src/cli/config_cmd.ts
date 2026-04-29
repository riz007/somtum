import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig, PROJECT_CONFIG_RELATIVE, GLOBAL_CONFIG_PATH } from '../config.js';

function parseDotPath(path: string): string[] {
  return path.split('.');
}

function getNestedValue(obj: unknown, keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i]!;
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  cur[last] = value;
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== '') return n;
  // Try JSON (arrays, objects)
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function configGetCommand(
  key: string | undefined,
  options: { json?: boolean; global?: boolean; cwd?: string } = {},
): number {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig({ cwd });

  if (!key) {
    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
    return 0;
  }

  const keys = parseDotPath(key);
  const value = getNestedValue(config, keys);
  if (value === undefined) {
    console.error(`unknown config key: ${key}`);
    return 1;
  }
  if (options.json) {
    console.log(JSON.stringify(value));
  } else {
    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  }
  return 0;
}

export function configSetCommand(
  key: string,
  rawValue: string,
  options: { global?: boolean; cwd?: string } = {},
): number {
  const cwd = options.cwd ?? process.cwd();
  const isGlobal = options.global ?? false;

  const configPath = isGlobal ? GLOBAL_CONFIG_PATH : join(cwd, PROJECT_CONFIG_RELATIVE);

  // Read existing config or start empty
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
      console.error(`failed to parse existing config at ${configPath}`);
      return 1;
    }
  }

  const keys = parseDotPath(key);
  const value = parseValue(rawValue);
  setNestedValue(existing, keys, value);

  const configDir = dirname(configPath);
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`set ${key} = ${JSON.stringify(value)} in ${configPath}`);
  return 0;
}
