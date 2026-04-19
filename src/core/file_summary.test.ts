import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from './db.js';
import {
  FileFingerprintStore,
  matchesAnyGlob,
  statFile,
  summarizeFile,
  summaryHash,
} from './file_summary.js';
import type { LlmCaller } from './extractor.js';

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-fs-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('matchesAnyGlob', () => {
  it('matches single-star and double-star patterns', () => {
    expect(matchesAnyGlob('a/b/c.env', ['**/*.env'])).toBe(true);
    expect(matchesAnyGlob('src/secrets/key.txt', ['**/secrets/**'])).toBe(true);
    expect(matchesAnyGlob('src/app.ts', ['**/*.env'])).toBe(false);
  });

  it('treats ? as a single non-slash char', () => {
    expect(matchesAnyGlob('a/x.ts', ['a/?.ts'])).toBe(true);
    expect(matchesAnyGlob('a/xy.ts', ['a/?.ts'])).toBe(false);
  });
});

describe('statFile', () => {
  it('returns null for missing files', () => {
    expect(statFile('nope.txt', { cwd: tmp })).toBeNull();
  });

  it('computes content hash and tokens for a real file', () => {
    const p = join(tmp, 'src.ts');
    writeFileSync(p, 'export const hello = 1;\n');
    const stat = statFile(p, { cwd: tmp });
    expect(stat).not.toBeNull();
    expect(stat!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stat!.tokens).toBeGreaterThan(0);
    expect(stat!.bytes).toBeGreaterThan(0);
  });
});

describe('FileFingerprintStore', () => {
  it('upsert + get round-trips', () => {
    const store = new FileFingerprintStore(db);
    store.upsert({
      project_id: 'p1',
      path: 'src/a.ts',
      content_hash: 'h1',
      mtime: 100,
      tokens: 50,
      summary: 'does stuff',
      summary_hash: summaryHash('does stuff'),
    });
    const got = store.get('p1', 'src/a.ts');
    expect(got?.content_hash).toBe('h1');
    expect(got?.summary).toBe('does stuff');
  });

  it('preserves an existing summary when upserting with null summary', () => {
    const store = new FileFingerprintStore(db);
    store.upsert({
      project_id: 'p1',
      path: 'src/a.ts',
      content_hash: 'h1',
      mtime: 100,
      tokens: 50,
      summary: 'original',
      summary_hash: summaryHash('original'),
    });
    store.upsert({
      project_id: 'p1',
      path: 'src/a.ts',
      content_hash: 'h2',
      mtime: 200,
      tokens: 60,
      summary: null,
      summary_hash: null,
    });
    const got = store.get('p1', 'src/a.ts');
    expect(got?.content_hash).toBe('h2');
    expect(got?.summary).toBe('original');
  });

  it('get returns null for unknown rows', () => {
    const store = new FileFingerprintStore(db);
    expect(store.get('p1', 'missing.ts')).toBeNull();
  });
});

describe('summarizeFile', () => {
  it('invokes the caller and returns trimmed text plus token counts', async () => {
    const calls: Array<{ system: string; user: string }> = [];
    const caller: LlmCaller = {
      async complete({ system, user }) {
        calls.push({ system, user });
        return { text: '  a terse summary  ', inputTokens: 10, outputTokens: 5 };
      },
    };
    const out = await summarizeFile('src/a.ts', 'export const x = 1;', {
      model: 'm',
      caller,
    });
    expect(out.summary).toBe('a terse summary');
    expect(out.tokensSpent).toBe(15);
    expect(calls[0]?.user).toContain('src/a.ts');
    expect(calls[0]?.user).toContain('export const x = 1;');
  });

  it('truncates pathologically large files', async () => {
    const seen: string[] = [];
    const caller: LlmCaller = {
      async complete({ user }) {
        seen.push(user);
        return { text: 'ok', inputTokens: 1, outputTokens: 1 };
      },
    };
    const big = 'x'.repeat(50);
    await summarizeFile('big.ts', big, { model: 'm', caller, maxBytes: 10 });
    expect(seen[0]).toContain('[... file truncated at 10 bytes');
  });
});
