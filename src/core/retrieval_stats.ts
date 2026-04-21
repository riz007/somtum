import type { DB } from './db.js';
import type { RetrievalStrategy } from './schema.js';

interface RetrievalRow {
  project_id: string;
  strategy: string;
  call_count: number;
  last_called_at: number | null;
}

interface CacheHitRow {
  project_id: string;
  hit_count: number;
  miss_count: number;
  last_hit_at: number | null;
}

export interface RetrievalBreakdown {
  strategy: RetrievalStrategy;
  call_count: number;
  last_called_at: number | null;
}

export interface CacheHitSummary {
  hit_count: number;
  miss_count: number;
  hit_rate: number | null;
}

export class RetrievalStatsStore {
  constructor(private readonly db: DB) {}

  incrementRetrieval(projectId: string, strategy: RetrievalStrategy): void {
    this.db
      .prepare(
        `INSERT INTO retrieval_stats (project_id, strategy, call_count, last_called_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT (project_id, strategy) DO UPDATE SET
           call_count = call_count + 1,
           last_called_at = excluded.last_called_at`,
      )
      .run(projectId, strategy, Date.now());
  }

  incrementCacheHit(projectId: string): void {
    this.db
      .prepare(
        `INSERT INTO cache_hit_stats (project_id, hit_count, miss_count, last_hit_at)
         VALUES (?, 1, 0, ?)
         ON CONFLICT (project_id) DO UPDATE SET
           hit_count = hit_count + 1,
           last_hit_at = excluded.last_hit_at`,
      )
      .run(projectId, Date.now());
  }

  incrementCacheMiss(projectId: string): void {
    this.db
      .prepare(
        `INSERT INTO cache_hit_stats (project_id, hit_count, miss_count, last_hit_at)
         VALUES (?, 0, 1, NULL)
         ON CONFLICT (project_id) DO UPDATE SET
           miss_count = miss_count + 1`,
      )
      .run(projectId);
  }

  getRetrievalBreakdown(projectId: string): RetrievalBreakdown[] {
    const rows = this.db
      .prepare(`SELECT * FROM retrieval_stats WHERE project_id = ? ORDER BY call_count DESC`)
      .all(projectId) as RetrievalRow[];
    return rows.map((r) => ({
      strategy: r.strategy as RetrievalStrategy,
      call_count: r.call_count,
      last_called_at: r.last_called_at,
    }));
  }

  getCacheHitSummary(projectId: string): CacheHitSummary {
    const row = this.db
      .prepare(`SELECT * FROM cache_hit_stats WHERE project_id = ?`)
      .get(projectId) as CacheHitRow | undefined;
    if (!row) return { hit_count: 0, miss_count: 0, hit_rate: null };
    const total = row.hit_count + row.miss_count;
    return {
      hit_count: row.hit_count,
      miss_count: row.miss_count,
      hit_rate: total > 0 ? Number((row.hit_count / total).toFixed(3)) : null,
    };
  }
}
