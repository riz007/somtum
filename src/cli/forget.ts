import { join } from 'node:path';
import { existsSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';

export function runForget(opts: {
  id: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): boolean {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    return store.softDelete(opts.id);
  } finally {
    db.close();
  }
}

export async function forgetAllCommand(opts: {
  cwd?: string;
  json?: boolean;
  yes?: boolean;
  dbPath?: string;
  projectId?: string;
} = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');

  if (!existsSync(dbPath)) {
    console.error('somtum: no database found');
    return 1;
  }

  if (!opts.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        'Soft-delete all observations for this project? [y/N] ',
      );
      if (answer.trim().toLowerCase() !== 'y') {
        console.log('Aborted.');
        return 0;
      }
    } finally {
      rl.close();
    }
  }

  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    const observations = store.listByProject(projectId);
    let count = 0;
    for (const o of observations) {
      if (store.softDelete(o.id)) count++;
    }
    if (opts.json) {
      console.log(JSON.stringify({ deleted: count }));
    } else {
      console.log(`forgotten: ${count} observation${count === 1 ? '' : 's'}`);
    }
    return 0;
  } finally {
    db.close();
  }
}

export function forgetCommand(id: string, options: { json?: boolean; cwd?: string } = {}): number {
  const deleted = runForget({ id, cwd: options.cwd ?? process.cwd() });
  if (options.json) {
    console.log(JSON.stringify({ id, deleted }));
    return deleted ? 0 : 1;
  }
  if (!deleted) {
    console.error(`no active observation with id ${id}`);
    return 1;
  }
  console.log(`forgotten: ${id}`);
  return 0;
}
