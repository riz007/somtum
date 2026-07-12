import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../core/db.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { ConfigSchema } from '../core/schema.js';
import { MemoryStore } from '../core/store.js';
import { RetrievalStatsStore } from '../core/retrieval_stats.js';
import { runPrePrompt } from './pre_prompt.js';

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-pre-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function seed(prompt: string, response: string, files: string[]): void {
  const cache = new PromptCache(db);
  const { fingerprint } = fingerprintFiles(files, { cwd: tmp });
  cache.put({
    prompt_hash: hashPrompt(prompt),
    prompt_text: prompt,
    response,
    model: 'test-model',
    context_fingerprint: fingerprint,
    files_touched: files,
  });
}

describe('runPrePrompt', () => {
  it('returns no-hit when the prompt is not cached', async () => {
    const r = await runPrePrompt(
      { prompt: 'what is a cache', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('no-hit');
  });

  it('returns a hit with the cached response as additionalContext', async () => {
    writeFileSync(join(tmp, 'notes.md'), 'stable content');
    seed('explain fingerprinting', 'Fingerprints are sha256 of sorted (path,hash) pairs.', [
      'notes.md',
    ]);
    const r = await runPrePrompt(
      { prompt: 'explain fingerprinting', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(true);
    expect(r.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
    expect(r.hookSpecificOutput?.additionalContext).toContain('Fingerprints are sha256');
  });

  it('invalidates when a referenced file has changed', async () => {
    writeFileSync(join(tmp, 'notes.md'), 'original');
    seed('what does notes.md say', 'it says original', ['notes.md']);
    writeFileSync(join(tmp, 'notes.md'), 'mutated');
    const r = await runPrePrompt(
      { prompt: 'what does notes.md say', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('fingerprint-mismatch');

    // Subsequent calls should now miss the invalidated entry entirely.
    const r2 = await runPrePrompt(
      { prompt: 'what does notes.md say', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r2.reason).toBe('no-hit');
  });

  it('respects cache.enabled = false', async () => {
    seed('anything', 'anything', []);
    const config = ConfigSchema.parse({ cache: { enabled: false } });
    const r = await runPrePrompt({ prompt: 'anything', cwd: tmp }, { db, config, projectId: 'p1' });
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('cache-disabled');
  });

  it('treats an empty prompt as a miss', async () => {
    const r = await runPrePrompt(
      { prompt: '   ', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
  });

  it('injects relevant memories into additionalContext on cache miss', async () => {
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'learning',
      title: 'always use pnpm',
      body: 'This project uses pnpm, not npm. Always run pnpm install.',
      files: [],
      tags: [],
    });

    const r = await runPrePrompt(
      { prompt: 'how do I install dependencies in this project', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
    expect(r.hookSpecificOutput?.additionalContext).toContain('always use pnpm');
  });

  it('records a cache hit in retrieval_stats', async () => {
    writeFileSync(join(tmp, 'readme.md'), 'stable');
    seed('explain caching', 'Caching stores prompt->response pairs.', ['readme.md']);
    await runPrePrompt(
      { prompt: 'explain caching', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    const stats = new RetrievalStatsStore(db).getCacheHitSummary('p1');
    expect(stats.hit_count).toBe(1);
    expect(stats.miss_count).toBe(0);
  });

  it('records a cache miss in retrieval_stats', async () => {
    await runPrePrompt(
      { prompt: 'something not cached', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    const stats = new RetrievalStatsStore(db).getCacheHitSummary('p1');
    expect(stats.miss_count).toBe(1);
    expect(stats.hit_count).toBe(0);
  });

  it('records bm25 retrieval in retrieval_stats when memories are injected', async () => {
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'decision',
      title: 'use vitest not jest',
      body: 'Switched to vitest for speed.',
      files: [],
      tags: [],
    });
    await runPrePrompt(
      { prompt: 'which test framework does this project use', cwd: tmp },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    const breakdown = new RetrievalStatsStore(db).getRetrievalBreakdown('p1');
    const bm25 = breakdown.find((r) => r.strategy === 'bm25');
    expect(bm25?.call_count).toBeGreaterThanOrEqual(1);
  });

  it('does not re-inject the same memory twice within one session', async () => {
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'learning',
      title: 'always use pnpm',
      body: 'This project uses pnpm, not npm. Always run pnpm install.',
      files: [],
      tags: [],
    });

    const first = await runPrePrompt(
      { prompt: 'how do I install dependencies with pnpm', cwd: tmp, session_id: 'sess-a' },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(first.hookSpecificOutput?.additionalContext).toContain('always use pnpm');

    const second = await runPrePrompt(
      { prompt: 'remind me how to install dependencies with pnpm', cwd: tmp, session_id: 'sess-a' },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(second.hookSpecificOutput?.additionalContext ?? '').not.toContain('always use pnpm');

    // A new session gets the memory again.
    const fresh = await runPrePrompt(
      { prompt: 'how do I install dependencies with pnpm', cwd: tmp, session_id: 'sess-b' },
      { db, config: ConfigSchema.parse({}), projectId: 'p1' },
    );
    expect(fresh.hookSpecificOutput?.additionalContext).toContain('always use pnpm');
  });

  it('skips memory injection when injection.enabled is false', async () => {
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'learning',
      title: 'always use pnpm',
      body: 'This project uses pnpm, not npm.',
      files: [],
      tags: [],
    });

    const config = ConfigSchema.parse({ injection: { enabled: false } });
    const r = await runPrePrompt(
      { prompt: 'how do I install dependencies', cwd: tmp },
      { db, config, projectId: 'p1' },
    );
    expect(r.hit).toBe(false);
    expect(r.hookSpecificOutput).toBeUndefined();
  });
});
