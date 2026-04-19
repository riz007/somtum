import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from './db.js';
import { PromptCache, hashPrompt, normalizePrompt } from './cache.js';

let tmp: string;
let db: DB;
let cache: PromptCache;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-cache-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  cache = new PromptCache(db);
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('normalize + hash', () => {
  it('normalization collapses whitespace', () => {
    expect(normalizePrompt('  hello   world  ')).toBe('hello world');
  });

  it('hashPrompt is stable and hex', () => {
    const h1 = hashPrompt('a');
    const h2 = hashPrompt('a');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('PromptCache', () => {
  it('returns null for a missing hash', () => {
    expect(cache.lookupByHash('nope')).toBeNull();
  });

  it('put inserts and lookupByHash returns the entry', () => {
    const hash = hashPrompt('what time is it');
    const entry = cache.put({
      prompt_hash: hash,
      prompt_text: 'what time is it',
      response: '12:00',
      model: 'claude-haiku-4-5-20251001',
      context_fingerprint: 'fp1',
    });
    expect(entry.hit_count).toBe(0);

    const found = cache.lookupByHash(hash);
    expect(found?.response).toBe('12:00');
  });

  it('touch increments hit_count', () => {
    const hash = hashPrompt('q');
    const entry = cache.put({
      prompt_hash: hash,
      prompt_text: 'q',
      response: 'a',
      model: 'm',
      context_fingerprint: 'fp',
    });
    cache.touch(entry.id);
    cache.touch(entry.id);
    const after = cache.lookupByHash(hash);
    expect(after?.hit_count).toBe(2);
  });

  it('invalidate hides an entry from lookupByHash', () => {
    const hash = hashPrompt('x');
    const entry = cache.put({
      prompt_hash: hash,
      prompt_text: 'x',
      response: 'y',
      model: 'm',
      context_fingerprint: 'fp',
    });
    cache.invalidate(entry.id);
    expect(cache.lookupByHash(hash)).toBeNull();
  });
});
