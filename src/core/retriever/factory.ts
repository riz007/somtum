import type { DB } from '../db.js';
import type { Config, RetrievalStrategy } from '../schema.js';
import type { Retriever } from './types.js';
import { Bm25Retriever } from './bm25.js';

// Returns a retriever by strategy name. Falls back to bm25 when the requested
// strategy's dependencies are not available (e.g. embeddings model not loaded).
// As new retrievers land, extend this factory — callers stay unchanged.
export function makeRetriever(strategy: RetrievalStrategy, db: DB, _config: Config): Retriever {
  switch (strategy) {
    case 'bm25':
      return new Bm25Retriever(db);
    case 'embeddings':
    case 'index':
    case 'hybrid':
      // Not yet implemented — fall back to BM25 rather than failing mid-query.
      // Callers may want to warn the user; the CLI and MCP layer handle that.
      return new Bm25Retriever(db);
    default:
      return new Bm25Retriever(db);
  }
}

export function strategyAvailable(strategy: RetrievalStrategy): boolean {
  return strategy === 'bm25';
}
