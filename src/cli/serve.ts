import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  H3,
  defineEventHandler,
  getQuery,
  getRouterParam,
  fromNodeHandler,
  toNodeHandler,
} from 'h3';
import { listen } from 'listhen';
import sirv from 'sirv';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { RetrievalStatsStore } from '../core/retrieval_stats.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir, loadConfig } from '../config.js';
import { makeRetriever } from '../core/retriever/factory.js';
import { RetrievalStrategy } from '../core/schema.js';
import type { Observation } from '../core/schema.js';

const GRAPH_NODE_CAP = 200;
const GRAPH_EDGE_CAP = 500;

function buildGraph(memories: Observation[]) {
  const capped = memories.slice(0, GRAPH_NODE_CAP);
  const nodes = capped.map((m) => ({
    id: m.id,
    label: m.title.length > 30 ? m.title.slice(0, 27) + '...' : m.title,
    kind: m.kind,
    title: m.title,
  }));

  const edges: { from: string; to: string }[] = [];
  outer: for (let i = 0; i < capped.length; i++) {
    for (let j = i + 1; j < capped.length; j++) {
      if (edges.length >= GRAPH_EDGE_CAP) break outer;
      const m1 = capped[i]!;
      const m2 = capped[j]!;
      if (m1.files.some((f) => m2.files.includes(f)) || m1.tags.some((t) => m2.tags.includes(t))) {
        edges.push({ from: m1.id, to: m2.id });
      }
    }
  }
  return { nodes, edges };
}

export async function runServe(options: { port?: number; open?: boolean; cwd?: string } = {}) {
  const cwd = options.cwd ?? process.cwd();
  const projectId = resolveProjectId(cwd);
  const dbPath = join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  const store = new MemoryStore(db);
  const cache = new PromptCache(db);
  const rsStats = new RetrievalStatsStore(db);
  const config = loadConfig({ cwd });

  const app = new H3();

  // Lightweight summary + pre-computed graph for initial load
  app.get(
    '/api/data',
    defineEventHandler(() => {
      const memories = store.listByProject(projectId);
      return {
        stats: {
          projectId,
          memories: store.countByProject(projectId),
          tokensSaved: store.totalTokensSaved(projectId),
          tokensSpent: store.totalTokensSpent(projectId),
        },
        memories,
        graph: buildGraph(memories),
      };
    }),
  );

  // Full analytics: kind breakdown, top files, retrieval usage, cache summary
  app.get(
    '/api/stats/full',
    defineEventHandler(() => ({
      kindBreakdown: store.countByKind(projectId),
      topFiles: store.topFileReferences(projectId, 20),
      retrieval: rsStats.getRetrievalBreakdown(projectId),
      cache: {
        ...rsStats.getCacheHitSummary(projectId),
        entry_count: cache.count(),
      },
    })),
  );

  // Server-side search — routes to the configured retriever strategy
  app.get(
    '/api/search',
    defineEventHandler(async (event) => {
      const q = getQuery(event);
      const query = String(q['q'] ?? '').trim();
      const k = Math.min(Math.max(1, Number(q['k'] ?? 8)), 50);
      if (!query) return { results: [], strategy: 'bm25' };
      const parsed = RetrievalStrategy.safeParse(q['strategy']);
      const strategy = parsed.success ? parsed.data : 'bm25';
      const retriever = makeRetriever(strategy, db, config);
      const results = await retriever.search(query, { k, projectId });
      return { results, strategy: retriever.name };
    }),
  );

  // Soft-delete a memory from the UI
  app.delete(
    '/api/memories/:id',
    defineEventHandler((event) => {
      const id = getRouterParam(event, 'id') ?? '';
      return { ok: store.softDelete(id) };
    }),
  );

  // Static dashboard — sirv wraps as a Node handler; only called for unmatched routes
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dashboardDir = join(__dirname, '..', 'dashboard');
  const sirvMiddleware = sirv(dashboardDir, { single: true, dev: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(fromNodeHandler((req: any, res: any) => sirvMiddleware(req, res, () => {})));

  await listen(toNodeHandler(app), {
    port: options.port ?? 3000,
    open: options.open ?? true,
    name: 'Somtum Dashboard',
    showURL: true,
  });
}

export async function serveCommand(
  options: { port?: number; open?: boolean; cwd?: string } = {},
): Promise<number> {
  try {
    await runServe(options);
    return 0;
  } catch (err) {
    console.error(`serve error: ${(err as Error).message}`);
    return 1;
  }
}
