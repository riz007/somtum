import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import { loadConfig, projectDir } from '../config.js';
import { makeRetriever } from '../core/retriever/factory.js';
import type { RetrievalResult } from '../core/retriever/types.js';
import type { RetrievalStrategy } from '../core/schema.js';
import { RetrievalStrategy as RetrievalStrategyEnum } from '../core/schema.js';

function snippet(body: string, max = 160): string {
  const single = body.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}

export async function runSearch(opts: {
  query: string;
  k?: number;
  strategy?: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
}): Promise<RetrievalResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const k = opts.k ?? config.retrieval.k;
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');

  // Resolve strategy: prefer explicit arg → config default
  const strategyRaw = opts.strategy ?? config.retrieval.strategy;
  const strategyParsed = RetrievalStrategyEnum.safeParse(strategyRaw);
  const strategy: RetrievalStrategy = strategyParsed.success ? strategyParsed.data : 'bm25';

  if (strategyParsed.success && strategyRaw !== strategy) {
    console.warn(`[somtum] unknown strategy "${strategyRaw}", falling back to bm25`);
  }

  const db = openDb({ path: dbPath });
  try {
    const retriever = makeRetriever(strategy, db, config);
    return await retriever.search(opts.query, { k, projectId });
  } finally {
    db.close();
  }
}

export async function searchCommand(
  query: string,
  options: { strategy?: string; k?: number; json?: boolean; cwd?: string } = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const searchOpts: Parameters<typeof runSearch>[0] = { query, cwd };
  if (options.k !== undefined) searchOpts.k = options.k;
  if (options.strategy !== undefined) searchOpts.strategy = options.strategy;
  const results = await runSearch(searchOpts);

  if (options.json) {
    console.log(
      JSON.stringify(
        results.map((r) => ({
          id: r.id,
          score: r.score,
          source: r.source,
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
    console.log(`${r.id}  [${r.observation.kind}] ${r.observation.title}  (${r.source}: ${r.score.toFixed(3)})`);
    console.log(`  ${snippet(r.observation.body)}`);
  }
  return 0;
}
