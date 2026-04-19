import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../db.js';
import { MemoryStore } from '../store.js';
import { Bm25Retriever, _forTestingOnly } from './bm25.js';

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
    expect(escapeFtsQuery('pnpm workspaces')).toBe('"pnpm" OR "workspaces"');
  });

  it('strips embedded quotes', () => {
    expect(escapeFtsQuery('a"b c')).toBe('"ab" OR "c"');
  });

  it('returns "" for empty input', () => {
    expect(escapeFtsQuery('')).toBe('""');
  });
});
