import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { ConfigSchema } from '../core/schema.js';
import { GLOBAL_PROJECT_ID } from '../config.js';
import { remember, recall, stats } from './tools.js';
import type { ToolContext } from './tools.js';
import type { DB } from '../core/db.js';

let tmp: string;
let db: DB;
let globalDb: DB;
let ctx: ToolContext;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-global-'));
  db = openDb({ path: join(tmp, 'project.sqlite') });
  globalDb = openDb({ path: join(tmp, 'global.sqlite') });
  ctx = { db, config: ConfigSchema.parse({}), projectId: 'p1', globalDb };
});

afterEach(() => {
  db.close();
  globalDb.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('M9 — global DB routing', () => {
  it('routes scope=global remember to globalDb, not project db', () => {
    remember(ctx, {
      title: 'always use pnpm',
      body: 'This repo uses pnpm. Run pnpm install.',
      kind: 'decision',
      files: [],
      tags: [],
      scope: 'global',
    });

    const projectStore = new MemoryStore(db);
    const globalStore = new MemoryStore(globalDb);

    expect(projectStore.countByProject('p1')).toBe(0);
    expect(globalStore.countByProject(GLOBAL_PROJECT_ID)).toBe(1);
  });

  it('routes scope=project remember to project db only', () => {
    remember(ctx, {
      title: 'project-level decision',
      body: 'Only relevant here.',
      kind: 'decision',
      files: [],
      tags: [],
      scope: 'project',
    });

    const projectStore = new MemoryStore(db);
    const globalStore = new MemoryStore(globalDb);

    expect(projectStore.countByProject('p1')).toBe(1);
    expect(globalStore.countByProject(GLOBAL_PROJECT_ID)).toBe(0);
  });

  it('recall merges project and global results', async () => {
    // Seed a project memory.
    new MemoryStore(db).insert({
      project_id: 'p1',
      session_id: 's1',
      kind: 'decision',
      title: 'use vitest for testing',
      body: 'vitest runs faster than jest.',
      files: [],
      tags: [],
    });

    // Seed a global memory.
    new MemoryStore(globalDb).insert({
      project_id: GLOBAL_PROJECT_ID,
      session_id: 'manual',
      kind: 'learning',
      title: 'pnpm is the package manager',
      body: 'always run pnpm install',
      files: [],
      tags: [],
      scope: 'global',
    });

    const result = (await recall(ctx, { query: 'testing and packages', k: 10 })) as {
      results: { title: string }[];
    };
    const titles = result.results.map((r) => r.title);
    expect(titles).toContain('use vitest for testing');
    expect(titles).toContain('pnpm is the package manager');
  });

  it('stats shows global_memories count', () => {
    new MemoryStore(globalDb).insert({
      project_id: GLOBAL_PROJECT_ID,
      session_id: 'manual',
      kind: 'decision',
      title: 'global memory',
      body: 'applies everywhere',
      files: [],
      tags: [],
      scope: 'global',
    });

    const s = stats(ctx) as { global_memories: number; memories: number };
    expect(s.global_memories).toBe(1);
    expect(s.memories).toBe(0); // project is empty
  });
});
