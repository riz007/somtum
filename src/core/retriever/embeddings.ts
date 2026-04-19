import type { DB } from '../db.js';
import { MemoryStore } from '../store.js';
import { cosineSimilarity, decodeVector, getEmbedder } from '../embeddings.js';
import type { Retriever, RetrievalResult, SearchOptions } from './types.js';

// Brute-force cosine over all stored vectors for the project. Fine up to
// tens of thousands of observations; swap for an ANN index later if needed.
export class EmbeddingsRetriever implements Retriever {
  readonly name = 'embeddings' as const;
  private readonly store: MemoryStore;

  constructor(db: DB) {
    this.store = new MemoryStore(db);
  }

  async search(query: string, options: SearchOptions): Promise<RetrievalResult[]> {
    if (query.trim().length === 0) return [];
    const embedder = await getEmbedder();
    const [qv] = await embedder.embed([query]);
    if (!qv) return [];

    const rows = this.store.listWithEmbeddings(options.projectId);
    const scored = rows.map((r) => {
      const v = decodeVector(r.embedding, embedder.dim);
      return { id: r.id, score: cosineSimilarity(qv, v) };
    });
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, options.k);
    const results: RetrievalResult[] = [];
    for (const s of top) {
      const obs = this.store.get(s.id);
      if (obs) results.push({ id: s.id, score: s.score, observation: obs, source: 'embeddings' });
    }
    return results;
  }
}
