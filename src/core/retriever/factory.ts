import Anthropic from '@anthropic-ai/sdk';
import type { DB } from '../db.js';
import type { Config, RetrievalStrategy } from '../schema.js';
import type { Retriever } from './types.js';
import { Bm25Retriever } from './bm25.js';
import { EmbeddingsRetriever } from './embeddings.js';
import { HybridRetriever } from './hybrid.js';
import { LlmIndexRetriever } from './llm_index.js';
import { anthropicCaller } from '../extractor.js';
import { isEmbedderReady } from '../embeddings.js';

// Returns a retriever by strategy name. Falls back to BM25 when the requested
// strategy's prerequisites are missing (e.g. embeddings disabled in config or
// the model has not been loaded). Callers that care about the fallback can
// check `strategyAvailable` up front.
export function makeRetriever(strategy: RetrievalStrategy, db: DB, config: Config): Retriever {
  switch (strategy) {
    case 'bm25':
      return new Bm25Retriever(db);
    case 'embeddings':
      if (!config.retrieval.embeddings.enabled) return new Bm25Retriever(db);
      return new EmbeddingsRetriever(db);
    case 'hybrid':
      if (!config.retrieval.embeddings.enabled) return new Bm25Retriever(db);
      return new HybridRetriever(db);
    case 'index': {
      if (!config.retrieval.index.enabled) return new Bm25Retriever(db);
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) return new Bm25Retriever(db);
      const caller = anthropicCaller(new Anthropic({ apiKey }));
      return new LlmIndexRetriever(db, {
        caller,
        model: config.retrieval.index.model,
      });
    }
    default:
      return new Bm25Retriever(db);
  }
}

export function strategyAvailable(strategy: RetrievalStrategy, config?: Config): boolean {
  if (strategy === 'bm25') return true;
  if (strategy === 'embeddings' || strategy === 'hybrid') {
    if (!config?.retrieval.embeddings.enabled) return false;
    return isEmbedderReady() || true;
  }
  if (strategy === 'index') {
    return Boolean(config?.retrieval.index.enabled && process.env['ANTHROPIC_API_KEY']);
  }
  return false;
}
