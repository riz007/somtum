// Golden set for the embeddings (vector) retriever.
// Uses a deterministic fake embedder that assigns each observation a unique
// sparse vector so we can test recall without needing the ONNX model on disk.
//
// To test with the real bge-small-en-v1.5 model, set SOMTUM_REAL_EMBEDDINGS=1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EmbeddingsRetriever } from '../../src/core/retriever/embeddings.js';
import { setEmbedder, encodeVector, EMBEDDING_DIM } from '../../src/core/embeddings.js';
import { MemoryStore } from '../../src/core/store.js';
import { buildTestDb, GOLDEN_QUERIES, OBSERVATIONS, PROJECT_ID, recallAtK } from './fixtures.js';

// Deterministic fake embedder: each unique text gets a unit vector with a
// distinct non-zero component at position (hash mod dim).  The same text
// always gets the same vector, so similarity is reproducible.
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
  // Set a "primary" component based on the full text hash
  const primary = deterministicHash(text) % EMBEDDING_DIM;
  v[primary] = 1.0;
  // Add secondary signal from individual words so multi-word queries find matches
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const idx = deterministicHash(word) % EMBEDDING_DIM;
    if (v[idx] === undefined) v[idx] = 0;
    v[idx] = Math.min(1.0, (v[idx] ?? 0) + 0.3);
  }
  // Normalize to unit length
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
    name: 'fake-deterministic',
    dim: EMBEDDING_DIM,
    embed: async (texts: string[]) => texts.map(fakeEmbed),
  });

  // Populate embedding vectors for all observations
  const allObs = store.listByProject(PROJECT_ID);
  for (const obs of allObs) {
    const text = `${obs.title}\n\n${obs.body}`;
    const vec = fakeEmbed(text);
    store.setEmbedding(obs.id, encodeVector(vec));
  }
});

afterAll(() => {
  setEmbedder(null);
  db.close();
});

describe('Embeddings retriever — golden recall@k (fake deterministic embedder)', () => {
  for (const gq of GOLDEN_QUERIES) {
    it(`recall@${gq.k}: "${gq.query}"${gq.description ? ` (${gq.description})` : ''}`, async () => {
      const retriever = new EmbeddingsRetriever(db);
      const results = await retriever.search(gq.query, { k: gq.k, projectId: PROJECT_ID });
      const resultIds = results.map((r) => r.id);
      const recall = recallAtK(resultIds, gq.expectedIds);

      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1.0001); // cosine similarity ≤ 1
        expect(r.source).toBe('embeddings');
      }

      // For the fake embedder we expect recall@k ≥ 0.5 (not 1.0 since the
      // fake embedder uses sparse hash-based vectors, not semantic ones).
      // The real bge model achieves 1.0 on these queries.
      const minRecall = process.env['SOMTUM_REAL_EMBEDDINGS'] === '1' ? 1.0 : 0.5;
      expect(recall).toBeGreaterThanOrEqual(
        minRecall,
        `Embeddings recall@${gq.k} below ${minRecall} for "${gq.query}": ` +
          `expected [${gq.expectedIds.join(', ')}] in results [${resultIds.join(', ')}]`,
      );
    });
  }

  it('returns empty array for query with no embeddings available', async () => {
    // Build a fresh DB with no embeddings populated
    const { db: freshDb } = buildTestDb();
    const retriever = new EmbeddingsRetriever(freshDb);
    const results = await retriever.search('sqlite', { k: 5, projectId: PROJECT_ID });
    expect(results).toHaveLength(0);
    freshDb.close();
  });

  it('respects k limit', async () => {
    const retriever = new EmbeddingsRetriever(db);
    const results = await retriever.search('sqlite decision configuration', {
      k: 2,
      projectId: PROJECT_ID,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns empty for unknown project', async () => {
    const retriever = new EmbeddingsRetriever(db);
    const results = await retriever.search('sqlite', { k: 5, projectId: 'unknown' });
    expect(results).toHaveLength(0);
  });
});
