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

// Soft-deletes the memories captured on one branch, e.g. an abandoned
// experiment whose decisions should not resurface once the branch is deleted.
export function runForgetBranch(opts: {
  branch: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): number {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    let count = 0;
    for (const o of store.listByProject(projectId, { includeSuperseded: true })) {
      if (o.git_branch === opts.branch && store.softDelete(o.id)) count += 1;
    }
    return count;
  } finally {
    db.close();
  }
}

export function forgetBranchCommand(
  branch: string,
  options: { json?: boolean; cwd?: string } = {},
): number {
  const count = runForgetBranch({ branch, cwd: options.cwd ?? process.cwd() });
  if (options.json) {
    console.log(JSON.stringify({ branch, deleted: count }));
  } else {
    console.log(`forgotten: ${count} observation${count === 1 ? '' : 's'} from branch ${branch}`);
  }
  return 0;
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
