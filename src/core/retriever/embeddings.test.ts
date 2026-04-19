import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../db.js';
import { MemoryStore } from '../store.js';
import { EMBEDDING_DIM, setEmbedder, encodeVector } from '../embeddings.js';
import { EmbeddingsRetriever } from './embeddings.js';
import { HybridRetriever } from './hybrid.js';

// Tiny deterministic embedder: hashes each input into a fixed bag of dims
// so the same tokens always map to similar vectors. Good enough for the
// retriever logic tests — the quality of the real embedding is not under
// test here.
function makeTestEmbedder(): void {
  const vectorFor = (text: string): Float32Array => {
    const v = new Float32Array(EMBEDDING_DIM);
    for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      let h = 5381;
      for (let i = 0; i < word.length; i += 1) h = (h * 33 + word.charCodeAt(i)) >>> 0;
      v[h % EMBEDDING_DIM] = (v[h % EMBEDDING_DIM] ?? 0) + 1;
    }
    // Normalize to unit length.
    let n = 0;
    for (let i = 0; i < EMBEDDING_DIM; i += 1) n += (v[i] ?? 0) ** 2;
    const mag = Math.sqrt(n) || 1;
    for (let i = 0; i < EMBEDDING_DIM; i += 1) v[i] = (v[i] ?? 0) / mag;
    return v;
  };

  setEmbedder({
    name: 'test-embedder',
    dim: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map(vectorFor);
    },
  });
}

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'somtum-emb-'));
  db = openDb({ path: join(tmp, 'db.sqlite') });
  makeTestEmbedder();
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
  setEmbedder(null);
});

async function seed(title: string, body: string): Promise<string> {
  const store = new MemoryStore(db);
  const obs = store.insert({
    project_id: 'p1',
    session_id: 's1',
    kind: 'learning',
    title,
    body,
  });
  // Embed + persist.
  const { getEmbedder } = await import('../embeddings.js');
  const emb = await getEmbedder();
  const [v] = await emb.embed([`${title}\n\n${body}`]);
  store.setEmbedding(obs.id, encodeVector(v!));
  return obs.id;
}

describe('EmbeddingsRetriever', () => {
  it('returns observations ranked by cosine similarity', async () => {
    await seed('caching strategy', 'We use prompt hashing plus file fingerprints.');
    await seed('database schema', 'observations, cache_entries, file_fingerprints tables.');
    const r = new EmbeddingsRetriever(db);
    const results = await r.search('prompt hashing', { k: 2, projectId: 'p1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.observation.title).toBe('caching strategy');
    expect(results[0]?.source).toBe('embeddings');
  });

  it('returns an empty list for an empty query', async () => {
    await seed('anything', 'anything');
    const r = new EmbeddingsRetriever(db);
    const results = await r.search('', { k: 5, projectId: 'p1' });
    expect(results).toEqual([]);
  });
});

describe('HybridRetriever', () => {
  it('fuses BM25 and embeddings results with RRF', async () => {
    await seed('prompt cache fingerprint', 'Hashing strategy for cache.');
    await seed('schema migrations', 'SQLite migrations run on open.');
    const h = new HybridRetriever(db);
    const results = await h.search('fingerprint', { k: 5, projectId: 'p1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.source).toBe('hybrid');
    expect(results[0]?.observation.title).toContain('fingerprint');
  });

  it('still returns results when the embedder errors', async () => {
    await seed('some memory', 'body text for bm25');
    setEmbedder({
      name: 'broken',
      dim: EMBEDDING_DIM,
      async embed(): Promise<Float32Array[]> {
        throw new Error('embedder boom');
      },
    });
    const h = new HybridRetriever(db);
    const results = await h.search('memory', { k: 5, projectId: 'p1' });
    expect(results.length).toBeGreaterThan(0);
  });
});
