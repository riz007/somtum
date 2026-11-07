import type { DB } from '../db.js';
import type { Observation } from '../schema.js';
import { MemoryStore } from '../store.js';
import type { RetrievalResult, Retriever, SearchOptions } from './types.js';

// SQLite FTS5 MATCH uses an embedded query grammar; user input with bare
// punctuation can raise "fts5: syntax error". We quote each token to treat
// the input as a bag of literal terms (phrase-ish), which is the right
// behavior for natural-language queries against BM25.
// Terms are OR-ed, so a single shared function word ("the", "how") would make
// almost every memory a match and get it injected into an unrelated prompt.
const STOPWORDS = new Set(
  (
    'a about above after again all am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing done down during each few for from further ' +
    'get got had has have having he her here hers him his how i if in into is it its itself just ' +
    'let me more most my no nor not now of off on once only or other our ours out over own please ' +
    'same she should so some such than thank thanks that the their theirs them then there these ' +
    'they this those through to too under until up us very was we were what when where which ' +
    'while who whom why will with would you your yours'
  ).split(' '),
);

function escapeFtsQuery(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/["]/g, '').trim())
    .filter((t) => t.length > 0)
    .filter((t) => !STOPWORDS.has(t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')));
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
           AND o.superseded_by IS NULL
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
