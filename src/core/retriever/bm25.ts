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

// Strips common English inflections so "installed" finds "install" and
// "classes" finds "class". Deliberately light: no stemming of word roots.
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Below this length a prefix match is too loose ("form" would match "format").
const MIN_PREFIX = 5;

// The distinct content words of a query as match keys: lowercased, stemmed,
// split the way the FTS5 unicode61 tokenizer splits text.
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return [...new Set(words.filter((w) => w.length > 0 && !STOPWORDS.has(w)).map(stem))];
}

function keyMatches(key: string, word: string): boolean {
  return key.length >= MIN_PREFIX ? word.startsWith(key) : word === key;
}

// How many of the `queryTerms` keys occur in `text`.
export function countMatchedTerms(keys: string[], text: string): number {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return keys.filter((k) => words.some((w) => keyMatches(k, w))).length;
}

function escapeFtsQuery(query: string): string {
  const keys = queryTerms(query);
  if (keys.length === 0) return '""';
  return keys.map((k) => (k.length >= MIN_PREFIX ? `"${k}"*` : `"${k}"`)).join(' OR ');
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
