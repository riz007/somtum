import type { Config } from './schema.js';
import { setEmbedderLoader, isEmbedderReady } from './embeddings.js';

// Idempotent: wires up a lazy loader for the real Xenova embedder when
// embeddings are enabled. Tests bypass this by calling `setEmbedder` directly
// with a deterministic fake.
export function ensureEmbedderConfigured(config: Config): void {
  if (!config.retrieval.embeddings.enabled) return;
  if (isEmbedderReady()) return;
  const modelName = config.retrieval.embeddings.model;
  setEmbedderLoader(async () => {
    const { createXenovaEmbedder } = await import('./embeddings_xenova.js');
    return createXenovaEmbedder(modelName);
  });
}
