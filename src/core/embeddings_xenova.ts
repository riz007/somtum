// Xenova/transformers-backed embedder. Kept in its own module so the heavy
// dynamic import only happens when embeddings are actually enabled.

import { createRequire } from 'node:module';
import { EMBEDDING_DIM, type Embedder, normalize } from './embeddings.js';

// An optional peer dependency: most users never enable embeddings, and the
// library pulls in onnxruntime and sharp (native image code) for everyone.
export const EMBEDDINGS_PACKAGE = '@xenova/transformers';
export const EMBEDDINGS_INSTALL_HINT = `npm install -g ${EMBEDDINGS_PACKAGE}`;

export function embeddingsPackageInstalled(): boolean {
  try {
    createRequire(import.meta.url).resolve(EMBEDDINGS_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

export async function createXenovaEmbedder(
  modelName: string = 'Xenova/bge-small-en-v1.5',
): Promise<Embedder> {
  if (!embeddingsPackageInstalled()) {
    throw new Error(
      `Embeddings need ${EMBEDDINGS_PACKAGE}, which is not installed. Run: ${EMBEDDINGS_INSTALL_HINT}`,
    );
  }
  const { pipeline } = (await import(EMBEDDINGS_PACKAGE)) as {
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
