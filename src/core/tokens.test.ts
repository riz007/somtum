import { describe, it, expect } from 'vitest';
import { countTokens, sumTokens } from './tokens.js';

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns a positive integer for real text', () => {
    const n = countTokens('Hello, world! This is Somtum.');
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  it('scales with input length', () => {
    const a = countTokens('short');
    const b = countTokens('short '.repeat(50));
    expect(b).toBeGreaterThan(a);
  });
});

describe('sumTokens', () => {
  it('sums multiple parts and matches concatenated count within BPE drift', () => {
    const parts = ['alpha ', 'beta ', 'gamma'];
    const s = sumTokens(...parts);
    const c = countTokens(parts.join(''));
    expect(Math.abs(s - c)).toBeLessThanOrEqual(3);
  });
});
