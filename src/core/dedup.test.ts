import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { MemoryStore } from './store.js';
import { deduplicateObservations } from './dedup.js';
import type { DB } from './db.js';

let tmp: string;
let db: DB;
let store: MemoryStore;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-dedup-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  store = new MemoryStore(db);
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

function obs(title: string, kind = 'decision', session = 's1') {
  return store.insert({
    project_id: 'p1',
    session_id: session,
    kind: kind as 'decision',
    title,
    body: 'body text',
    files: [],
    tags: [],
  });
}

describe('deduplicateObservations', () => {
  it('returns zero when there are no prior observations', () => {
    const newObs = obs('switched to vitest from jest', 'decision', 's2');
    const r = deduplicateObservations(db, 'p1', [newObs.id]);
    expect(r.superseded).toBe(0);
  });

  it('marks the older observation superseded when titles are near-identical', () => {
    const old = obs('switched from jest to vitest', 'decision', 's1');
    const fresh = obs('switched to vitest from jest', 'decision', 's2');

    const r = deduplicateObservations(db, 'p1', [fresh.id]);
    expect(r.superseded).toBe(1);
    expect(r.pairs[0]?.oldId).toBe(old.id);
    expect(r.pairs[0]?.newId).toBe(fresh.id);

    // Old one should be marked superseded in the DB.
    const reloaded = store.get(old.id);
    expect(reloaded?.superseded_by).toBe(fresh.id);

    // New one should NOT be marked superseded.
    const freshReloaded = store.get(fresh.id);
    expect(freshReloaded?.superseded_by).toBeNull();
  });

  it('does not supersede across different kinds', () => {
    obs('use pnpm not npm', 'decision', 's1');
    const fresh = obs('use pnpm not npm', 'learning', 's2');
    const r = deduplicateObservations(db, 'p1', [fresh.id]);
    expect(r.superseded).toBe(0);
  });

  it('does not supersede observations from the same session', () => {
    const a = obs('use pnpm always', 'decision', 's1');
    const b = obs('use pnpm always for installs', 'decision', 's1');
    // Both same session — dedup should not fire.
    const r = deduplicateObservations(db, 'p1', [a.id, b.id]);
    expect(r.superseded).toBe(0);
  });

  it('skips already-superseded observations', () => {
    const old = obs('use pnpm', 'decision', 's1');
    const mid = obs('use pnpm always', 'decision', 's2');
    deduplicateObservations(db, 'p1', [mid.id]); // old is now superseded by mid

    // New observation similar to old — should not try to supersede it again.
    const fresh = obs('use pnpm everywhere', 'decision', 's3');
    const r = deduplicateObservations(db, 'p1', [fresh.id]);
    // old is already superseded, so only mid is a candidate
    expect(store.get(old.id)?.superseded_by).toBe(mid.id); // unchanged
    // mid may or may not be superseded — just verify old is untouched
    expect(r.pairs.every((p) => p.oldId !== old.id)).toBe(true);
  });

  it('returns empty result for an empty id list', () => {
    const r = deduplicateObservations(db, 'p1', []);
    expect(r.superseded).toBe(0);
    expect(r.pairs).toHaveLength(0);
  });
});
