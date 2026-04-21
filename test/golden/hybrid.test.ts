// Golden set for the hybrid retriever (BM25 + embeddings via RRF).
// Uses the same deterministic fake embedder as embeddings.test.ts.
// Recall@k for hybrid must be at least as good as BM25 alone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HybridRetriever } from '../../src/core/retriever/hybrid.js';
import { setEmbedder, encodeVector, EMBEDDING_DIM } from '../../src/core/embeddings.js';
import { MemoryStore } from '../../src/core/store.js';
import { buildTestDb, GOLDEN_QUERIES, PROJECT_ID, recallAtK } from './fixtures.js';

function deterministicHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function fakeEmbed(text: string): Float32Array {
  const v = new Float32Array(EMBEDDING_DIM);
  const primary = deterministicHash(text) % EMBEDDING_DIM;
  v[primary] = 1.0;
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const idx = deterministicHash(word) % EMBEDDING_DIM;
    if (v[idx] === undefined) v[idx] = 0;
    v[idx] = Math.min(1.0, (v[idx] ?? 0) + 0.3);
  }
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += (v[i] ?? 0) ** 2;
  const mag = Math.sqrt(norm);
  if (mag > 0) for (let i = 0; i < v.length; i += 1) v[i] = (v[i] ?? 0) / mag;
  return v;
}

let db: ReturnType<typeof buildTestDb>['db'];
let store: MemoryStore;

beforeAll(() => {
  ({ db, store } = buildTestDb());

  setEmbedder({
    name: 'fake-deterministic-hybrid',
    dim: EMBEDDING_DIM,
    embed: async (texts: string[]) => texts.map(fakeEmbed),
  });

  const allObs = store.listByProject(PROJECT_ID);
  for (const obs of allObs) {
    const text = `${obs.title}\n\n${obs.body}`;
    store.setEmbedding(obs.id, encodeVector(fakeEmbed(text)));
  }
});

afterAll(() => {
  setEmbedder(null);
  db.close();
});

describe('Hybrid retriever — golden recall@k (RRF blend)', () => {
  for (const gq of GOLDEN_QUERIES) {
    it(`recall@${gq.k}: "${gq.query}"${gq.description ? ` (${gq.description})` : ''}`, async () => {
      const retriever = new HybridRetriever(db);
      const results = await retriever.search(gq.query, { k: gq.k, projectId: PROJECT_ID });
      const resultIds = results.map((r) => r.id);
      const recall = recallAtK(resultIds, gq.expectedIds);

      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.source).toBe('hybrid');
      }

      // Hybrid should do at least as well as BM25 alone (recall@k ≥ 1.0 for
      // exact-term queries where BM25 already gets 1.0).
      expect(recall).toBe(
        1.0,
        `Hybrid recall@${gq.k} regression for "${gq.query}": ` +
          `expected [${gq.expectedIds.join(', ')}] in results [${resultIds.join(', ')}]`,
      );
    });
  }

  it('degrades gracefully when embedder throws', async () => {
    setEmbedder({
      name: 'always-fails',
      dim: EMBEDDING_DIM,
      embed: async () => {
        throw new Error('embedder offline');
      },
    });
    const retriever = new HybridRetriever(db);
    // Should still return BM25 results even with broken embedder
    const results = await retriever.search('sqlite wal', { k: 3, projectId: PROJECT_ID });
    expect(Array.isArray(results)).toBe(true);
    // Restore
    setEmbedder({
      name: 'fake-deterministic-hybrid',
      dim: EMBEDDING_DIM,
      embed: async (texts: string[]) => texts.map(fakeEmbed),
    });
  });

  it('returns empty for unknown project', async () => {
    const retriever = new HybridRetriever(db);
    const results = await retriever.search('sqlite', { k: 5, projectId: 'unknown' });
    expect(results).toHaveLength(0);
  });

  it('respects k limit', async () => {
    const retriever = new HybridRetriever(db);
    const results = await retriever.search('sqlite pnpm validation hook', {
      k: 2,
      projectId: PROJECT_ID,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
