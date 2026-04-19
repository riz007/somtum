import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';

let globalDir: string;
let projectDir: string;

beforeEach(() => {
  globalDir = mkdtempSync(join(tmpdir(), 'somtum-g-'));
  projectDir = mkdtempSync(join(tmpdir(), 'somtum-p-'));
});

afterEach(() => {
  rmSync(globalDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns full defaults when no config files exist', () => {
    const cfg = loadConfig({
      cwd: projectDir,
      global: join(globalDir, 'config.json'),
    });
    expect(cfg.cache.enabled).toBe(true);
    expect(cfg.retrieval.strategy).toBe('bm25');
  });

  it('project config overrides global', () => {
    writeFileSync(
      join(globalDir, 'config.json'),
      JSON.stringify({ cache: { ttl_days: 30, max_entries: 500 } }),
    );
    mkdirSync(join(projectDir, '.somtum'));
    writeFileSync(
      join(projectDir, '.somtum', 'config.json'),
      JSON.stringify({ cache: { ttl_days: 7 } }),
    );

    const cfg = loadConfig({
      cwd: projectDir,
      global: join(globalDir, 'config.json'),
    });
    expect(cfg.cache.ttl_days).toBe(7);
    expect(cfg.cache.max_entries).toBe(500);
  });

  it('throws on invalid config', () => {
    writeFileSync(
      join(globalDir, 'config.json'),
      JSON.stringify({ cache: { fuzzy_threshold: 5 } }),
    );
    expect(() =>
      loadConfig({ cwd: projectDir, global: join(globalDir, 'config.json') }),
    ).toThrow();
  });
});
