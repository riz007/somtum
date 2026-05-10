import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { listCommand } from './list.js';

const PROJECT_ID = 'list-test-project';

let tmp: string;
let dbPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-list-'));
  dbPath = join(tmp, 'db.sqlite');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function seed(): void {
  const db = openDb({ path: dbPath });
  const store = new MemoryStore(db);
  store.insert({ project_id: PROJECT_ID, session_id: 's1', kind: 'decision', title: 'use pnpm', body: 'prefer pnpm over npm', files: [], tags: [] });
  store.insert({ project_id: PROJECT_ID, session_id: 's1', kind: 'bugfix', title: 'fix null check', body: 'added null guard', files: [], tags: [] });
  store.insert({ project_id: PROJECT_ID, session_id: 's1', kind: 'learning', title: 'zod schemas', body: 'always use zod for validation', files: [], tags: [] });
  db.close();
}

describe('listCommand', () => {
  it('returns 1 when no database exists', () => {
    const code = listCommand({ dbPath: join(tmp, 'missing.sqlite'), projectId: PROJECT_ID });
    expect(code).toBe(1);
  });

  it('lists all observations', () => {
    seed();
    const code = listCommand({ dbPath, projectId: PROJECT_ID });
    expect(code).toBe(0);
  });

  it('filters by kind', () => {
    seed();
    const output: string[] = [];
    const origLog = console.log;
    console.log = (s: string) => output.push(s);
    try {
      listCommand({ dbPath, projectId: PROJECT_ID, kind: 'decision' });
    } finally {
      console.log = origLog;
    }
    expect(output.join('\n')).toContain('use pnpm');
    expect(output.join('\n')).not.toContain('fix null check');
  });

  it('returns 1 on unknown kind', () => {
    seed();
    const code = listCommand({ dbPath, projectId: PROJECT_ID, kind: 'nonexistent' });
    expect(code).toBe(1);
  });

  it('emits valid JSON with --json', () => {
    seed();
    const output: string[] = [];
    const origLog = console.log;
    console.log = (s: string) => output.push(s);
    try {
      listCommand({ dbPath, projectId: PROJECT_ID, json: true });
    } finally {
      console.log = origLog;
    }
    const parsed = JSON.parse(output[0]!) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  it('respects --limit', () => {
    seed();
    const output: string[] = [];
    const origLog = console.log;
    console.log = (s: string) => output.push(s);
    try {
      listCommand({ dbPath, projectId: PROJECT_ID, json: true, limit: 2 });
    } finally {
      console.log = origLog;
    }
    const parsed = JSON.parse(output[0]!) as unknown[];
    expect(parsed.length).toBe(2);
  });
});
