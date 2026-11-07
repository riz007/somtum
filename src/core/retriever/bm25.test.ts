import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../db.js';
import { MemoryStore } from '../store.js';
import { Bm25Retriever, _forTestingOnly, queryTerms, countMatchedTerms } from './bm25.js';

let tmp: string;
let db: DB;
let store: MemoryStore;
let retriever: Bm25Retriever;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-bm25-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  store = new MemoryStore(db);
  retriever = new Bm25Retriever(db);
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('Bm25Retriever.search (Retriever interface)', () => {
  it('returns empty for whitespace-only query', async () => {
    const r = await retriever.search('   ', { k: 8, projectId: 'p1' });
    expect(r).toEqual([]);
  });

  it('finds observations by keyword and ranks them', async () => {
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'Switch to pnpm',
      body: 'We use pnpm workspaces to manage packages.',
    });
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'learning',
      title: 'Vitest vs Jest',
      body: 'Vitest is faster on ESM projects.',
    });
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'learning',
      title: 'Unrelated',
      body: 'Chose black coffee over latte.',
    });

    const results = await retriever.search('pnpm workspaces', {
      k: 8,
      projectId: 'p1',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.observation.title).toBe('Switch to pnpm');
    expect(results[0]?.source).toBe('bm25');
  });

  it('respects project_id isolation', async () => {
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'Alpha',
      body: 'pnpm is great',
    });
    store.insert({
      project_id: 'p2',
      session_id: 's',
      kind: 'decision',
      title: 'Beta',
      body: 'pnpm is great',
    });

    const r = await retriever.search('pnpm', { k: 8, projectId: 'p1' });
    expect(r).toHaveLength(1);
    expect(r[0]?.observation.project_id).toBe('p1');
  });

  it('excludes soft-deleted observations', async () => {
    const obs = store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'Deleted',
      body: 'pnpm is great',
    });
    store.softDelete(obs.id);
    const r = await retriever.search('pnpm', { k: 8, projectId: 'p1' });
    expect(r).toHaveLength(0);
  });

  it('respects k', async () => {
    for (let i = 0; i < 5; i += 1) {
      store.insert({
        project_id: 'p1',
        session_id: 's',
        kind: 'decision',
        title: `pnpm ${i}`,
        body: 'pnpm pnpm pnpm',
      });
    }
    const r = await retriever.search('pnpm', { k: 3, projectId: 'p1' });
    expect(r).toHaveLength(3);
  });
});

describe('escapeFtsQuery (internal helper)', () => {
  const { escapeFtsQuery } = _forTestingOnly();

  it('quotes each token and joins with OR', () => {
    expect(escapeFtsQuery('pnpm workspaces')).toBe('"pnpm" OR "workspace"*');
  });

  it('treats embedded quotes as separators', () => {
    expect(escapeFtsQuery('foo"bar baz')).toBe('"foo" OR "bar" OR "baz"');
  });

  it('returns "" for empty input', () => {
    expect(escapeFtsQuery('')).toBe('""');
  });

  it('drops stopwords, including ones with trailing punctuation', () => {
    expect(escapeFtsQuery('How do I fix the pnpm install?')).toBe(
      '"fix" OR "pnpm" OR "install"*',
    );
  });

  it('returns "" when only stopwords remain', () => {
    expect(escapeFtsQuery('what is this?')).toBe('""');
  });
});

describe('Bm25Retriever stopword behaviour', () => {
  it('does not match a memory on a shared function word alone', async () => {
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'Use pnpm',
      body: 'This is the package manager for the repo.',
    });
    const r = await retriever.search('what is the weather like', { k: 8, projectId: 'p1' });
    expect(r).toEqual([]);
  });
});

describe('queryTerms / countMatchedTerms', () => {
  it('splits like the FTS tokenizer and drops stopwords and duplicates', () => {
    expect(queryTerms('How do I set up @tailwindcss/vite? Tailwind, tailwind!')).toEqual([
      'set',
      'tailwindcss',
      'vite',
      'tailwind',
    ]);
  });

  it('strips inflections so related forms match', () => {
    expect(queryTerms('installed classes applying projects')).toEqual([
      'install',
      'class',
      'apply',
      'project',
    ]);
    expect(countMatchedTerms(queryTerms('tailwind installed'), 'npm install tailwindcss')).toBe(2);
    expect(countMatchedTerms(queryTerms('form'), 'format the date')).toBe(0);
  });

  it('counts whole-word matches only', () => {
    expect(countMatchedTerms(['state', 'usereducer'], 'Use useState; never useReducer')).toBe(1);
  });
});

