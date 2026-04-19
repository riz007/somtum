import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { Bm25Retriever } from '../core/retriever/bm25.js';
import { resolveProjectId } from '../core/project_id.js';
import { loadConfig, projectDir } from '../config.js';
import type { RetrievalResult } from '../core/retriever/types.js';

function snippet(body: string, max = 160): string {
  const single = body.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}

export async function runSearch(opts: {
  query: string;
  k?: number;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): Promise<RetrievalResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const k = opts.k ?? config.retrieval.k;
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    if (config.retrieval.strategy !== 'bm25') {
      console.warn(
        `[somtum] strategy "${config.retrieval.strategy}" is not available yet; falling back to bm25`,
      );
    }
    const retriever = new Bm25Retriever(db);
    return await retriever.search(opts.query, { k, projectId });
  } finally {
    db.close();
  }
}

export async function searchCommand(
  query: string,
  options: { strategy?: string; k?: number; json?: boolean; cwd?: string } = {},
): Promise<number> {
  if (options.strategy && options.strategy !== 'bm25') {
    console.warn(`[somtum] only bm25 is implemented today; ignoring --strategy=${options.strategy}`);
  }
  const cwd = options.cwd ?? process.cwd();
  const results = await runSearch(
    options.k !== undefined ? { query, k: options.k, cwd } : { query, cwd },
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        results.map((r) => ({
          id: r.id,
          score: r.score,
          title: r.observation.title,
          kind: r.observation.kind,
          files: r.observation.files,
        })),
        null,
        2,
      ),
    );
    return 0;
  }

  if (results.length === 0) {
    console.log('no matches');
    return 0;
  }
  for (const r of results) {
    console.log(`${r.id}  [${r.observation.kind}] ${r.observation.title}`);
    console.log(`  ${snippet(r.observation.body)}`);
  }
  return 0;
}
