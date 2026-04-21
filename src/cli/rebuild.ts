import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { generateIndex } from '../core/index_gen.js';
import { resolveProjectId, projectNameFromCwd } from '../core/project_id.js';
import { projectDir } from '../config.js';

export interface RebuildResult {
  project_id: string;
  observations: number;
  output_path: string;
}

export function runRebuild(
  opts: { cwd?: string; dbPath?: string; projectId?: string } = {},
): RebuildResult {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const outputPath = join(projectDir(projectId), 'index.md');

  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    const obs = store.listByProject(projectId);
    const totalTokensSaved = store.totalTokensSaved(projectId);
    generateIndex({
      store,
      projectId,
      outputPath,
      projectName: projectNameFromCwd(cwd),
      totalTokensSaved,
    });
    return { project_id: projectId, observations: obs.length, output_path: outputPath };
  } finally {
    db.close();
  }
}

export function rebuildCommand(options: { json?: boolean; cwd?: string } = {}): number {
  const result = runRebuild({ cwd: options.cwd ?? process.cwd() });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`rebuilt index.md from ${result.observations} observations`);
    console.log(`output: ${result.output_path}`);
  }
  return 0;
}
