import type { DB } from './db.js';
import { MemoryStore } from './store.js';
import { encodeVector, getEmbedder } from './embeddings.js';
import type { Observation } from './schema.js';

export interface ReindexResult {
  embedded: number;
  failed: number;
}

function textForObservation(obs: Observation): string {
  // bge models benefit from a compact query-style concatenation; the
  // order matches what the retriever will ultimately see on the read side.
  return `${obs.title}\n\n${obs.body}`;
}

// Walks all un-embedded observations for a project, embeds them in batches,
// and persists each vector back onto the row. Safe to re-run; already-embedded
// rows are skipped by `listMissingEmbeddings`.
export async function embedMissing(
  db: DB,
  projectId: string,
  opts: { batchSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ReindexResult> {
  const store = new MemoryStore(db);
  const batchSize = opts.batchSize ?? 16;
  const pending = store.listMissingEmbeddings(projectId, 10_000);
  if (pending.length === 0) return { embedded: 0, failed: 0 };

  const embedder = await getEmbedder();
  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    try {
      const vectors = await embedder.embed(batch.map(textForObservation));
      batch.forEach((obs, j) => {
        const v = vectors[j];
        if (!v) return;
        store.setEmbedding(obs.id, encodeVector(v));
        embedded += 1;
      });
    } catch {
      failed += batch.length;
    }
    if (opts.onProgress) opts.onProgress(Math.min(i + batchSize, pending.length), pending.length);
  }
  return { embedded, failed };
}
