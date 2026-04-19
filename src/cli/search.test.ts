import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { runSearch } from './search.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-searchcmd-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('runSearch', () => {
  it('returns BM25 hits scoped to the project', async () => {
    const dbPath = join(tmp, 'db.sqlite');
    const db = openDb({ path: dbPath });
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'Use pnpm',
      body: 'pnpm workspaces chosen',
    });
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'bugfix',
      title: 'unrelated',
      body: 'something else entirely',
    });
    db.close();

    const results = await runSearch({
      query: 'pnpm',
      cwd: tmp,
      dbPath,
      projectId: 'p1',
    });
    expect(results[0]?.observation.title).toBe('Use pnpm');
  });
});
