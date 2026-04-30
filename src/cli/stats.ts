import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { RetrievalStatsStore } from '../core/retrieval_stats.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';

export interface StatsSnapshot {
  project_id: string;
  memories: number;
  by_kind: Record<string, number>;
  cache_entries: number;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate: number | null;
  retrieval_by_strategy: Array<{ strategy: string; call_count: number }>;
  tokens_saved_estimated: number;
  tokens_spent_estimated: number;
  net_estimated: number;
  breakeven_ratio_estimated: number | null;
}

export function collectStats(
  opts: { cwd?: string; dbPath?: string; projectId?: string } = {},
): StatsSnapshot {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    const cache = new PromptCache(db);
    const statsStore = new RetrievalStatsStore(db);
    const saved = store.totalTokensSaved(projectId);
    const spent = store.totalTokensSpent(projectId);
    const cacheHits = statsStore.getCacheHitSummary(projectId);
    const retrievalBreakdown = statsStore.getRetrievalBreakdown(projectId);
    return {
      project_id: projectId,
      memories: store.countByProject(projectId),
      by_kind: store.countByKind(projectId),
      cache_entries: cache.count(),
      cache_hits: cacheHits.hit_count,
      cache_misses: cacheHits.miss_count,
      cache_hit_rate: cacheHits.hit_rate,
      retrieval_by_strategy: retrievalBreakdown,
      tokens_saved_estimated: saved,
      tokens_spent_estimated: spent,
      net_estimated: saved - spent,
      breakeven_ratio_estimated: spent > 0 ? Number((saved / spent).toFixed(2)) : null,
    };
  } finally {
    db.close();
  }
}

function printHuman(s: StatsSnapshot): void {
  console.log(`project        ${s.project_id}`);
  console.log(`memories       ${s.memories}`);
  for (const [k, n] of Object.entries(s.by_kind)) {
    if (n > 0) console.log(`  ${k.padEnd(15)} ${n}`);
  }
  console.log(`cache entries  ${s.cache_entries}`);
  console.log(`cache hits     ${s.cache_hits}`);
  console.log(`cache misses   ${s.cache_misses}`);
  const hitRate = s.cache_hit_rate !== null ? `${(s.cache_hit_rate * 100).toFixed(1)}%` : 'n/a';
  console.log(`cache hit rate ${hitRate}`);

  if (s.retrieval_by_strategy.length > 0) {
    console.log(`retrieval calls by strategy:`);
    for (const r of s.retrieval_by_strategy) {
      console.log(`  ${r.strategy.padEnd(12)} ${r.call_count}`);
    }
  }

  console.log(`tokens saved   ${s.tokens_saved_estimated} (estimated)`);
  console.log(`tokens spent   ${s.tokens_spent_estimated} (estimated)`);
  console.log(`net            ${s.net_estimated} (estimated)`);
  const br = s.breakeven_ratio_estimated;
  if (br !== null) {
    const warn = br < 1.5 ? '  — below 1.5x, check `somtum doctor`' : '';
    console.log(`breakeven      ${br}x (estimated)${warn}`);
  } else {
    console.log(`breakeven      n/a (no extraction cost recorded yet)`);
  }
}

export function statsCommand(options: { json?: boolean; cwd?: string } = {}): number {
  const snap = collectStats({ cwd: options.cwd ?? process.cwd() });
  if (options.json) {
    console.log(JSON.stringify(snap, null, 2));
  } else {
    printHuman(snap);
    if (snap.memories === 0) {
      console.log('');
      const hasKey = Boolean(process.env['ANTHROPIC_API_KEY']?.trim());
      if (!hasKey) {
        console.log('hint: ANTHROPIC_API_KEY is not set. The SessionEnd hook cannot extract');
        console.log('      observations without it. Add it to your shell profile, then re-run');
        console.log('      a Claude session. Check full setup with: somtum doctor');
      } else {
        console.log('hint: No memories captured yet. After your next Claude session ends,');
        console.log('      the SessionEnd hook will extract observations automatically.');
        console.log('      Run `somtum doctor` to verify the hook is installed correctly.');
      }
    }
  }
  return 0;
}
