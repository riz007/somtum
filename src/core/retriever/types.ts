import type { Observation } from '../schema.js';

export interface RetrievalResult {
  id: string;
  score: number;
  observation: Observation;
  // Strategy that produced this result. Useful for `stats` per-strategy breakdown.
  source: 'bm25' | 'embeddings' | 'index' | 'hybrid';
}

export interface SearchOptions {
  k: number;
  projectId: string;
}

// Every retriever implements this interface. Strategy-specific options
// belong on the implementation, not on the shared call signature.
export interface Retriever {
  readonly name: 'bm25' | 'embeddings' | 'index' | 'hybrid';
  search(query: string, options: SearchOptions): Promise<RetrievalResult[]>;
}
