// Xenova/transformers-backed embedder. Kept in its own module so the heavy
// dynamic import only happens when embeddings are actually enabled.

import { EMBEDDING_DIM, type Embedder, normalize } from './embeddings.js';

export async function createXenovaEmbedder(
  modelName: string = 'Xenova/bge-small-en-v1.5',
): Promise<Embedder> {
  // Dynamic import keeps startup lean; transformers pulls in ~30MB of deps.
  const { pipeline } = (await import('@xenova/transformers')) as {
    pipeline: (
      task: string,
      model: string,
    ) => Promise<
      (
        inputs: string[],
        opts: { pooling: string; normalize: boolean },
      ) => Promise<{ data: Float32Array; dims: number[] }>
    >;
  };

  const extract = await pipeline('feature-extraction', modelName);

  return {
    name: modelName,
    dim: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      // Mean-pool + L2-normalize to get a single vector per input.
      const out = await extract(texts, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1] ?? EMBEDDING_DIM;
      const batch = texts.length;
      const flat = out.data;
      const vectors: Float32Array[] = [];
      for (let i = 0; i < batch; i += 1) {
        const slice = flat.subarray(i * dim, (i + 1) * dim);
        vectors.push(normalize(new Float32Array(slice)));
      }
      return vectors;
    },
  };
}
