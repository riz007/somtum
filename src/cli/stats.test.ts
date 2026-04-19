import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { collectStats } from './stats.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-stats-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('collectStats', () => {
  it('reports zeros for an empty db', () => {
    const dbPath = join(tmp, 'db.sqlite');
    openDb({ path: dbPath }).close();
    const s = collectStats({ cwd: tmp, dbPath, projectId: 'p1' });
    expect(s.memories).toBe(0);
    expect(s.tokens_saved_estimated).toBe(0);
    expect(s.breakeven_ratio_estimated).toBeNull();
  });

  it('aggregates tokens_saved and tokens_spent', () => {
    const dbPath = join(tmp, 'db.sqlite');
    const db = openDb({ path: dbPath });
    const store = new MemoryStore(db);
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'A',
      body: 'b',
      tokens_saved: 30,
      tokens_spent: 10,
    });
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'B',
      body: 'b',
      tokens_saved: 20,
      tokens_spent: 5,
    });
    db.close();

    const s = collectStats({ cwd: tmp, dbPath, projectId: 'p1' });
    expect(s.memories).toBe(2);
    expect(s.tokens_saved_estimated).toBe(50);
    expect(s.tokens_spent_estimated).toBe(15);
    expect(s.net_estimated).toBe(35);
    expect(s.breakeven_ratio_estimated).toBeCloseTo(50 / 15, 2);
  });
});
