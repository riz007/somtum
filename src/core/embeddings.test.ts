import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  decodeVector,
  encodeVector,
  normalize,
  EMBEDDING_DIM,
} from './embeddings.js';

describe('embeddings primitives', () => {
  it('encode/decode round-trips a 384-dim vector', () => {
    const v = new Float32Array(EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i += 1) v[i] = Math.sin(i) * 0.1;
    const decoded = decodeVector(encodeVector(v));
    expect(decoded.length).toBe(EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i += 1) {
      expect(decoded[i]).toBeCloseTo(v[i]!, 6);
    }
  });

  it('decodeVector rejects wrong-size buffers', () => {
    expect(() => decodeVector(Buffer.alloc(10))).toThrow(/wrong size/);
  });

  it('cosineSimilarity of a vector with itself is 1', () => {
    const v = normalize(new Float32Array([1, 2, 3, 4]));
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('cosineSimilarity of orthogonal vectors is 0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('normalize produces a unit vector', () => {
    const v = normalize(new Float32Array([3, 4]));
    // 3-4-5 triangle: (3/5)² + (4/5)² = 1
    let n = 0;
    for (let i = 0; i < v.length; i += 1) n += (v[i] ?? 0) ** 2;
    expect(Math.sqrt(n)).toBeCloseTo(1, 6);
  });
});
