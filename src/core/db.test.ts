import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations, appliedVersions, hasFts5 } from './db.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-db-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('openDb + migrations', () => {
  it('applies migrations on a fresh db and is idempotent on reopen', () => {
    const path = join(tmp, 'a.sqlite');

    const db1 = openDb({ path });
    const versions1 = appliedVersions(db1);
    expect(versions1).toContain(1);
    db1.close();

    const db2 = openDb({ path });
    const versions2 = appliedVersions(db2);
    expect(versions2).toEqual(versions1);

    // Re-running migrations on an already-migrated DB applies 0 new migrations.
    const applied = runMigrations(db2);
    expect(applied).toBe(0);
    db2.close();
  });

  it('creates observations_fts via FTS5', () => {
    const db = openDb({ path: join(tmp, 'fts.sqlite') });
    expect(hasFts5(db)).toBe(true);

    db.prepare(
      `INSERT INTO observations (id, project_id, session_id, kind, title, body, files, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('o1', 'p1', 's1', 'decision', 'Use pnpm', 'Chose pnpm for workspace support.', '[]', '[]', Date.now());

    const rows = db
      .prepare(
        `SELECT o.id FROM observations_fts f
         JOIN observations o ON o.rowid = f.rowid
         WHERE observations_fts MATCH ?`,
      )
      .all('pnpm');
    expect(rows).toEqual([{ id: 'o1' }]);
    db.close();
  });

  it('enforces the kind check constraint', () => {
    const db = openDb({ path: join(tmp, 'check.sqlite') });
    expect(() =>
      db
        .prepare(
          `INSERT INTO observations (id, project_id, session_id, kind, title, body, created_at)
           VALUES ('x','p','s','nope','t','b',0)`,
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
