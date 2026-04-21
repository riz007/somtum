// Golden set for BM25 (FTS5) retriever.
// Recall@k must be 100% for all queries in the golden set.
// Regressions here block merge (see CLAUDE.md §Changing a retriever).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'better-sqlite3';
import { Bm25Retriever } from '../../src/core/retriever/bm25.js';
import { buildTestDb, GOLDEN_QUERIES, PROJECT_ID, recallAtK } from './fixtures.js';

let db: InstanceType<typeof import('better-sqlite3').default>;

beforeAll(() => {
  ({ db } = buildTestDb());
});

afterAll(() => {
  db.close();
});

describe('BM25 retriever — golden recall@k', () => {
  for (const gq of GOLDEN_QUERIES) {
    it(`recall@${gq.k}: "${gq.query}"${gq.description ? ` (${gq.description})` : ''}`, async () => {
      const retriever = new Bm25Retriever(db);
      const results = await retriever.search(gq.query, { k: gq.k, projectId: PROJECT_ID });
      const resultIds = results.map((r) => r.id);
      const recall = recallAtK(resultIds, gq.expectedIds);

      // All results must be valid observations from our fixture set
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.source).toBe('bm25');
        expect(r.observation.project_id).toBe(PROJECT_ID);
      }

      expect(recall).toBe(
        1.0,
        `BM25 recall@${gq.k} regression for "${gq.query}": ` +
          `expected [${gq.expectedIds.join(', ')}] in results [${resultIds.join(', ')}]`,
      );
    });
  }

  it('returns empty array for empty query', async () => {
    const retriever = new Bm25Retriever(db);
    const results = await retriever.search('   ', { k: 5, projectId: PROJECT_ID });
    expect(results).toHaveLength(0);
  });

  it('returns empty array for unknown project', async () => {
    const retriever = new Bm25Retriever(db);
    const results = await retriever.search('sqlite', { k: 5, projectId: 'no-such-project' });
    expect(results).toHaveLength(0);
  });

  it('respects k limit', async () => {
    const retriever = new Bm25Retriever(db);
    const results = await retriever.search('sqlite hybrid decision', {
      k: 2,
      projectId: PROJECT_ID,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('handles punctuation in query without throwing', async () => {
    const retriever = new Bm25Retriever(db);
    const results = await retriever.search('sqlite "WAL" mode', { k: 5, projectId: PROJECT_ID });
    // Should not throw; may return 0 results depending on quoting
    expect(Array.isArray(results)).toBe(true);
  });
});
