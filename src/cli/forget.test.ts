import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { runForget, forgetAllCommand } from './forget.js';

const PROJECT_ID = 'forget-test-project';

let tmp: string;
let dbPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-forget-'));
  dbPath = join(tmp, 'db.sqlite');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function seed(): string[] {
  const db = openDb({ path: dbPath });
  const store = new MemoryStore(db);
  const a = store.insert({ project_id: PROJECT_ID, session_id: 's1', kind: 'decision', title: 'use pnpm', body: 'body', files: [], tags: [] });
  const b = store.insert({ project_id: PROJECT_ID, session_id: 's1', kind: 'bugfix', title: 'fix null', body: 'body', files: [], tags: [] });
  db.close();
  return [a.id, b.id];
}

describe('runForget', () => {
  it('soft-deletes an observation by id', () => {
    const [id] = seed();
    const deleted = runForget({ id: id!, dbPath, projectId: PROJECT_ID });
    expect(deleted).toBe(true);

    const db = openDb({ path: dbPath });
    const store = new MemoryStore(db);
    const obs = store.listByProject(PROJECT_ID);
    db.close();
    expect(obs.find((o) => o.id === id)).toBeUndefined();
  });

  it('returns false for unknown id', () => {
    seed();
    const deleted = runForget({ id: 'nonexistent', dbPath, projectId: PROJECT_ID });
    expect(deleted).toBe(false);
  });
});

describe('forgetAllCommand', () => {
  it('soft-deletes all observations with yes=true', async () => {
    seed();
    const code = await forgetAllCommand({ dbPath, projectId: PROJECT_ID, yes: true });
    expect(code).toBe(0);

    const db = openDb({ path: dbPath });
    const store = new MemoryStore(db);
    const obs = store.listByProject(PROJECT_ID);
    db.close();
    expect(obs).toHaveLength(0);
  });

  it('returns count in json mode', async () => {
    seed();
    const output: string[] = [];
    const origLog = console.log;
    console.log = (s: string) => output.push(s);
    try {
      await forgetAllCommand({ dbPath, projectId: PROJECT_ID, yes: true, json: true });
    } finally {
      console.log = origLog;
    }
    const result = JSON.parse(output[0]!) as { deleted: number };
    expect(result.deleted).toBe(2);
  });
});
