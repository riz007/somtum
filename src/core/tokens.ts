import { encode } from 'gpt-tokenizer';

// gpt-tokenizer is a BPE approximation, not the exact tokenizer Claude uses.
// When estimates drift, prefer undercounting over overclaiming.
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

export function sumTokens(...parts: string[]): number {
  return parts.reduce((n, p) => n + countTokens(p), 0);
}
