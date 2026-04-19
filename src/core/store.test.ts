import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from './db.js';
import { MemoryStore } from './store.js';
import { ConfigSchema } from './schema.js';

let tmp: string;
let db: DB;
let store: MemoryStore;

const DEFAULT_PATTERNS = ConfigSchema.parse({}).privacy.redact_patterns;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-store-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  store = new MemoryStore(db);
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('MemoryStore', () => {
  it('inserts and reads back an observation with generated id + created_at', () => {
    const obs = store.insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'decision',
      title: 'Use pnpm',
      body: 'Workspaces.',
    });

    expect(obs.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(obs.created_at).toBeGreaterThan(0);

    const loaded = store.get(obs.id);
    expect(loaded?.title).toBe('Use pnpm');
  });

  it('rejects invalid input via zod', () => {
    expect(() =>
      store.insert({
        project_id: 'p1',
        session_id: 's1',
        // @ts-expect-error invalid on purpose
        kind: 'not-a-kind',
        title: 't',
        body: 'b',
      }),
    ).toThrow();
  });

  it('redacts title and body at the boundary', () => {
    const obs = store.insert(
      {
        project_id: 'p1',
        session_id: 's1',
        kind: 'learning',
        title: 'key sk-ant-abcdefghijklmnopqrstuvwxyz012345 seen',
        body: 'Also Authorization: Bearer abc.def.ghi in logs',
      },
      { redactPatterns: DEFAULT_PATTERNS },
    );

    expect(obs.title).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(obs.body.toLowerCase()).not.toContain('abc.def.ghi');
  });

  it('lists by project ordered by created_at desc', () => {
    const a = store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'A',
      body: 'a',
      created_at: 1,
    });
    const b = store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'B',
      body: 'b',
      created_at: 2,
    });
    const list = store.listByProject('p1');
    expect(list.map((o) => o.id)).toEqual([b.id, a.id]);
  });

  it('soft-deletes and excludes from default list', () => {
    const a = store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'decision',
      title: 'A',
      body: 'a',
    });
    expect(store.softDelete(a.id)).toBe(true);
    expect(store.listByProject('p1')).toHaveLength(0);
    expect(store.listByProject('p1', { includeDeleted: true })).toHaveLength(1);
  });

  it('counts by kind with zeros for missing kinds', () => {
    store.insert({
      project_id: 'p1',
      session_id: 's',
      kind: 'bugfix',
      title: 'B',
      body: 'b',
    });
    const counts = store.countByKind('p1');
    expect(counts.bugfix).toBe(1);
    expect(counts.decision).toBe(0);
  });
});
