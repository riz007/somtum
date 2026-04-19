import { join } from 'node:path';
import { loadConfig, projectDir } from '../config.js';
import { openDb } from '../core/db.js';
import { resolveProjectId, projectNameFromCwd } from '../core/project_id.js';
import { ensureEmbedderConfigured } from '../core/embeddings_bootstrap.js';
import { embedMissing } from '../core/reindex.js';

export interface ReindexOptions {
  cwd?: string;
  json?: boolean;
}

export async function reindexCommand(options: ReindexOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig({ cwd });

  if (!config.retrieval.embeddings.enabled) {
    const msg =
      'Embeddings are disabled in config. Enable with: somtum config set retrieval.embeddings.enabled true';
    if (options.json) console.log(JSON.stringify({ ok: false, reason: 'disabled' }));
    else console.error(msg);
    return 1;
  }

  const projectId = resolveProjectId(cwd);
  const projectName = projectNameFromCwd(cwd);
  const dbPath = join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });

  ensureEmbedderConfigured(config);

  try {
    if (!options.json) {
      console.log(`somtum: reindexing ${projectName} (model: ${config.retrieval.embeddings.model})`);
    }
    const result = await embedMissing(db, projectId, {
      onProgress: (done, total) => {
        if (!options.json) process.stderr.write(`\r  ${done}/${total} embedded`);
      },
    });
    if (!options.json) process.stderr.write('\n');

    if (options.json) {
      console.log(JSON.stringify({ ok: true, project_id: projectId, ...result }));
    } else {
      console.log(`  done: ${result.embedded} embedded, ${result.failed} failed`);
    }
    return 0;
  } finally {
    db.close();
  }
}
