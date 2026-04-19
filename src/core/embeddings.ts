// Embedder abstraction.
//
// A real embedder loads bge-small-en-v1.5 (~30MB once quantized) lazily on
// first use. Tests inject a deterministic fake via `setEmbedder` so they
// don't need the model on disk.
//
// Vectors are 384-dim f32. We store them as a Buffer in SQLite: no extra
// dependency, decode is a single Float32Array view over the buffer bytes.

export const EMBEDDING_DIM = 384;

export interface Embedder {
  // Returns one vector per input. Normalized to unit length so cosine
  // similarity reduces to a dot product.
  embed(texts: string[]): Promise<Float32Array[]>;
  readonly name: string;
  readonly dim: number;
}

let current: Embedder | null = null;
let loader: (() => Promise<Embedder>) | null = null;

export function setEmbedder(e: Embedder | null): void {
  current = e;
}

export function setEmbedderLoader(l: (() => Promise<Embedder>) | null): void {
  loader = l;
  current = null;
}

export async function getEmbedder(): Promise<Embedder> {
  if (current) return current;
  if (!loader) {
    throw new Error(
      'No embedder configured. Call setEmbedder() or setEmbedderLoader() before use.',
    );
  }
  current = await loader();
  return current;
}

export function isEmbedderReady(): boolean {
  return current !== null;
}

// Encode/decode vectors as byte buffers for SQLite storage.
// Using Float32Array.buffer keeps the layout stable across platforms that
// agree on little-endian — which is every platform Node runs on in practice.
export function encodeVector(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function decodeVector(buf: Buffer, dim: number = EMBEDDING_DIM): Float32Array {
  if (buf.length !== dim * 4) {
    throw new Error(`embedding blob wrong size: got ${buf.length} bytes, want ${dim * 4}`);
  }
  // Copy to detach from the underlying Buffer pool.
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, dim);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i += 1) n += (v[i] ?? 0) ** 2;
  const mag = Math.sqrt(n);
  if (mag === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = (v[i] ?? 0) / mag;
  return out;
}
