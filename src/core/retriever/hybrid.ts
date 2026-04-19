import type { DB } from '../db.js';
import { Bm25Retriever } from './bm25.js';
import { EmbeddingsRetriever } from './embeddings.js';
import type { Retriever, RetrievalResult, SearchOptions } from './types.js';

// Reciprocal Rank Fusion. Widely-used, parameter-light way to blend two
// ranked lists without having to normalize scores across strategies.
// k=60 is the standard default from the original RRF paper.
const RRF_K = 60;

function rrf(rank: number): number {
  return 1 / (RRF_K + rank + 1);
}

export interface HybridOptions {
  poolSize?: number;
}

export class HybridRetriever implements Retriever {
  readonly name = 'hybrid' as const;
  private readonly bm25: Bm25Retriever;
  private readonly embeddings: EmbeddingsRetriever;
  private readonly poolSize: number;

  constructor(db: DB, options: HybridOptions = {}) {
    this.bm25 = new Bm25Retriever(db);
    this.embeddings = new EmbeddingsRetriever(db);
    this.poolSize = options.poolSize ?? 50;
  }

  async search(query: string, options: SearchOptions): Promise<RetrievalResult[]> {
    const poolOpts = { k: this.poolSize, projectId: options.projectId };
    // Run both retrievers in parallel; if one throws (e.g. embedder not loaded)
    // the other still produces a result set.
    const [bm25Res, embRes] = await Promise.all([
      this.bm25.search(query, poolOpts).catch(() => [] as RetrievalResult[]),
      this.embeddings.search(query, poolOpts).catch(() => [] as RetrievalResult[]),
    ]);

    const merged = new Map<
      string,
      { result: RetrievalResult; score: number }
    >();

    const accumulate = (list: RetrievalResult[]): void => {
      list.forEach((r, i) => {
        const prev = merged.get(r.id);
        const contribution = rrf(i);
        if (prev) {
          prev.score += contribution;
        } else {
          merged.set(r.id, {
            result: { ...r, source: 'hybrid' },
            score: contribution,
          });
        }
      });
    };
    accumulate(bm25Res);
    accumulate(embRes);

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, options.k)
      .map((e) => ({ ...e.result, score: e.score }));
  }
}
