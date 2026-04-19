import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';
import type { Observation } from '../core/schema.js';

export function runShow(opts: {
  id: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): Observation | null {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    return store.get(opts.id);
  } finally {
    db.close();
  }
}

export function showCommand(id: string, options: { json?: boolean; cwd?: string } = {}): number {
  const obs = runShow({ id, cwd: options.cwd ?? process.cwd() });
  if (!obs) {
    console.error(`no observation with id ${id}`);
    return 1;
  }
  if (options.json) {
    // embedding is a Buffer; serialize length not contents
    const { embedding, ...rest } = obs;
    const serializable = { ...rest, embedding_bytes: embedding ? embedding.length : null };
    console.log(JSON.stringify(serializable, null, 2));
    return 0;
  }

  console.log(`id:         ${obs.id}`);
  console.log(`project:    ${obs.project_id}`);
  console.log(`session:    ${obs.session_id}`);
  console.log(`kind:       ${obs.kind}`);
  console.log(`created:    ${new Date(obs.created_at).toISOString()}`);
  if (obs.files.length > 0) console.log(`files:      ${obs.files.join(', ')}`);
  if (obs.tags.length > 0) console.log(`tags:       ${obs.tags.join(', ')}`);
  console.log(`saved est:  ${obs.tokens_saved} tokens`);
  console.log(`spent est:  ${obs.tokens_spent} tokens`);
  console.log('');
  console.log(`# ${obs.title}`);
  console.log('');
  console.log(obs.body);
  return 0;
}
