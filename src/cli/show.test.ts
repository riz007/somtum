import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { runShow } from './show.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-show-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('runShow', () => {
  it('returns null for a missing id', () => {
    const dbPath = join(tmp, 'db.sqlite');
    openDb({ path: dbPath }).close();
    expect(runShow({ id: 'nope', cwd: tmp, dbPath, projectId: 'p1' })).toBeNull();
  });

  it('returns the observation for a valid id', () => {
    const dbPath = join(tmp, 'db.sqlite');
    const db = openDb({ path: dbPath });
    const store = new MemoryStore(db);
    const obs = store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'hi',
      body: 'world',
    });
    db.close();

    const got = runShow({ id: obs.id, cwd: tmp, dbPath, projectId: 'p1' });
    expect(got?.id).toBe(obs.id);
    expect(got?.body).toBe('world');
  });
});
