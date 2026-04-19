import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../core/db.js';
import { ConfigSchema } from '../core/schema.js';
import { FileFingerprintStore, statFile, summaryHash } from '../core/file_summary.js';
import { runPreRead } from './pre_read.js';

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-preread-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function gatingOn(overrides: Record<string, unknown> = {}) {
  return ConfigSchema.parse({
    file_gating: {
      enabled: true,
      min_file_size_tokens: 1,
      exclude_globs: ['**/*.env'],
      ...overrides,
    },
  });
}

describe('runPreRead', () => {
  it('passes through when gating is disabled', () => {
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: 'anything' }, cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.gated).toBe(false);
    expect(r.reason).toBe('gating-disabled');
  });

  it('passes through for non-gateable tools', () => {
    const r = runPreRead(
      { tool_name: 'Bash', tool_input: { file_path: 'x.ts' }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('wrong-tool');
  });

  it('passes through when there is no file_path', () => {
    const r = runPreRead(
      { tool_name: 'Read', tool_input: {}, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('no-path');
  });

  it('passes through excluded paths', () => {
    const p = join(tmp, 'secrets.env');
    writeFileSync(p, 'API_KEY=deadbeef deadbeef deadbeef deadbeef');
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: p }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('excluded');
  });

  it('passes through missing files', () => {
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: join(tmp, 'gone.ts') }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('file-missing');
  });

  it('passes through files below the token threshold', () => {
    const p = join(tmp, 'tiny.ts');
    writeFileSync(p, 'x');
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: p }, cwd: tmp },
      { db, config: gatingOn({ min_file_size_tokens: 10_000 }), projectId: 'p1' },
    );
    expect(r.reason).toBe('below-threshold');
  });

  it('passes through when no summary is cached', () => {
    const p = join(tmp, 'big.ts');
    writeFileSync(p, 'export const x = 1;\n'.repeat(100));
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: p }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('no-summary');
  });

  it('passes through when the cached summary is stale', () => {
    const p = join(tmp, 'big.ts');
    writeFileSync(p, 'export const x = 1;\n'.repeat(100));
    new FileFingerprintStore(db).upsert({
      project_id: 'p1',
      path: p,
      content_hash: 'WRONG_HASH',
      mtime: 0,
      tokens: 500,
      summary: 'obsolete',
      summary_hash: summaryHash('obsolete'),
    });
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: p }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.reason).toBe('stale-summary');
  });

  it('injects additionalContext when a fresh summary exists', () => {
    const p = join(tmp, 'big.ts');
    writeFileSync(p, 'export const x = 1;\n'.repeat(100));
    const stat = statFile(p, { cwd: tmp })!;
    new FileFingerprintStore(db).upsert({
      project_id: 'p1',
      path: p,
      content_hash: stat.contentHash,
      mtime: stat.mtime,
      tokens: stat.tokens,
      summary: 'exports a numeric constant x',
      summary_hash: summaryHash('exports a numeric constant x'),
    });
    const r = runPreRead(
      { tool_name: 'Read', tool_input: { file_path: p }, cwd: tmp },
      { db, config: gatingOn(), projectId: 'p1' },
    );
    expect(r.gated).toBe(true);
    expect(r.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(r.hookSpecificOutput?.additionalContext).toContain('exports a numeric constant x');
    expect(r.hookSpecificOutput?.additionalContext).toContain(p);
  });
});
