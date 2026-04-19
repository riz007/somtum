import { describe, it, expect } from 'vitest';
import {
  ObservationInputSchema,
  ExtractorResponseSchema,
  ConfigSchema,
  ObservationKind,
  CacheEntrySchema,
} from './schema.js';

describe('ObservationInputSchema', () => {
  it('accepts a minimal valid input and applies defaults', () => {
    const parsed = ObservationInputSchema.parse({
      project_id: 'p1',
      session_id: 's1',
      kind: 'decision',
      title: 'Use pnpm',
      body: 'Chose pnpm for workspace support.',
    });
    expect(parsed.files).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.tokens_saved).toBe(0);
  });

  it('rejects a title over 80 chars', () => {
    const res = ObservationInputSchema.safeParse({
      project_id: 'p1',
      session_id: 's1',
      kind: 'decision',
      title: 'x'.repeat(81),
      body: 'b',
    });
    expect(res.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const res = ObservationInputSchema.safeParse({
      project_id: 'p1',
      session_id: 's1',
      kind: 'not-a-kind',
      title: 't',
      body: 'b',
    });
    expect(res.success).toBe(false);
  });
});

describe('ExtractorResponseSchema', () => {
  it('parses an array of observations', () => {
    const parsed = ExtractorResponseSchema.parse({
      observations: [
        { kind: 'learning', title: 'X', body: 'Y' },
        { kind: 'bugfix', title: 'A', body: 'B', files: ['a.ts'], tags: ['bug'] },
      ],
    });
    expect(parsed.observations).toHaveLength(2);
    expect(parsed.observations[0]?.files).toEqual([]);
  });

  it('rejects non-object root', () => {
    expect(ExtractorResponseSchema.safeParse([]).success).toBe(false);
  });
});

describe('ConfigSchema', () => {
  it('produces a full default config from an empty input', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.cache.fuzzy_threshold).toBeGreaterThan(0);
    expect(cfg.cache.fuzzy_threshold).toBeLessThanOrEqual(1);
    expect(cfg.privacy.redact_patterns.length).toBeGreaterThan(0);
    expect(cfg.extraction.max_retries).toBeGreaterThanOrEqual(0);
  });

  it('rejects fuzzy_threshold > 1', () => {
    const res = ConfigSchema.safeParse({ cache: { fuzzy_threshold: 1.5 } });
    expect(res.success).toBe(false);
  });
});

describe('ObservationKind', () => {
  it('enumerates the spec kinds', () => {
    expect(ObservationKind.options).toEqual([
      'decision',
      'learning',
      'bugfix',
      'file_summary',
      'command',
      'other',
    ]);
  });
});

describe('CacheEntrySchema', () => {
  it('requires all hot-path fields', () => {
    const ok = CacheEntrySchema.safeParse({
      id: 'c1',
      prompt_hash: 'h',
      prompt_text: 't',
      prompt_embedding: null,
      response: 'r',
      model: 'm',
      context_fingerprint: 'f',
      fingerprint_version: 1,
      created_at: 1,
      last_hit_at: 1,
      hit_count: 0,
      false_hit_count: 0,
      invalidated: false,
    });
    expect(ok.success).toBe(true);
  });
});
