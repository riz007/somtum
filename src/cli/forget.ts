import { join } from 'node:path';
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
