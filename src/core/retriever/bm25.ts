import type { DB } from '../db.js';
import { MemoryStore } from '../store.js';
import type { Observation } from '../schema.js';
import type { Retriever, RetrievalResult, SearchOptions } from './types.js';

// SQLite FTS5 MATCH uses an embedded query grammar; user input with bare
// punctuation can raise "fts5: syntax error". We quote each token to treat
// the input as a bag of literal terms (phrase-ish), which is the right
// behavior for natural-language queries against BM25.
function escapeFtsQuery(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/["]/g, '').trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t}"`).join(' OR ');
}

interface Bm25Row {
  id: string;
  score: number; // bm25() is a negative-going relevance; smaller = better
}

export class Bm25Retriever implements Retriever {
  readonly name = 'bm25' as const;
  private readonly store: MemoryStore;

  constructor(private readonly db: DB) {
    this.store = new MemoryStore(db);
  }

  async search(query: string, options: SearchOptions): Promise<RetrievalResult[]> {
    const ftsQuery = escapeFtsQuery(query);
    if (ftsQuery === '""') return [];

    // bm25() returns lower-is-better; invert so higher = more relevant,
    // and the Retriever contract's `score` reads naturally.
    const rows = this.db
      .prepare(
        `SELECT o.id AS id, -bm25(observations_fts) AS score
         FROM observations_fts
         JOIN observations o ON o.rowid = observations_fts.rowid
         WHERE observations_fts MATCH ?
           AND o.project_id = ?
           AND o.deleted_at IS NULL
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(ftsQuery, options.projectId, options.k) as Bm25Row[];

    const results: RetrievalResult[] = [];
    for (const row of rows) {
      const obs = this.store.get(row.id);
      if (obs) results.push({ id: row.id, score: row.score, observation: obs, source: 'bm25' });
    }
    return results;
  }
}

export function _forTestingOnly(): { escapeFtsQuery: (q: string) => string } {
  return { escapeFtsQuery };
}

export type { Observation };
