import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';

export interface StatsSnapshot {
  project_id: string;
  memories: number;
  by_kind: Record<string, number>;
  tokens_saved_estimated: number;
  tokens_spent_estimated: number;
  net_estimated: number;
  cache_entries: number;
  breakeven_ratio_estimated: number | null;
}

export function collectStats(opts: { cwd?: string; dbPath?: string; projectId?: string } = {}): StatsSnapshot {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    const cache = new PromptCache(db);
    const saved = store.totalTokensSaved(projectId);
    const spent = store.totalTokensSpent(projectId);
    return {
      project_id: projectId,
      memories: store.countByProject(projectId),
      by_kind: store.countByKind(projectId),
      tokens_saved_estimated: saved,
      tokens_spent_estimated: spent,
      net_estimated: saved - spent,
      breakeven_ratio_estimated: spent > 0 ? Number((saved / spent).toFixed(2)) : null,
      cache_entries: cache.count(),
    };
  } finally {
    db.close();
  }
}

function printHuman(s: StatsSnapshot): void {
  console.log(`project      ${s.project_id}`);
  console.log(`memories     ${s.memories}`);
  for (const [k, n] of Object.entries(s.by_kind)) console.log(`  ${k.padEnd(13)} ${n}`);
  console.log(`cache entries ${s.cache_entries}`);
  console.log(`tokens saved  ${s.tokens_saved_estimated} (estimated)`);
  console.log(`tokens spent  ${s.tokens_spent_estimated} (estimated)`);
  console.log(`net           ${s.net_estimated} (estimated)`);
  const br = s.breakeven_ratio_estimated;
  if (br !== null) {
    const warn = br < 1.5 ? '  — below 1.5x, check `somtum doctor`' : '';
    console.log(`breakeven     ${br}x (estimated)${warn}`);
  } else {
    console.log(`breakeven     n/a (no extraction cost recorded yet)`);
  }
}

export function statsCommand(options: { json?: boolean; cwd?: string } = {}): number {
  const snap = collectStats({ cwd: options.cwd ?? process.cwd() });
  if (options.json) {
    console.log(JSON.stringify(snap, null, 2));
  } else {
    printHuman(snap);
  }
  return 0;
}
