import { z } from 'zod';

export const ObservationKind = z.enum([
  'decision',
  'learning',
  'bugfix',
  'file_summary',
  'command',
  'other',
]);
export type ObservationKind = z.infer<typeof ObservationKind>;

export const ObservationSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  session_id: z.string().min(1),
  kind: ObservationKind,
  title: z.string().min(1).max(80),
  body: z.string(),
  files: z.array(z.string()),
  tags: z.array(z.string()),
  created_at: z.number().int().nonnegative(),
  tokens_saved: z.number().int().nonnegative(),
  tokens_spent: z.number().int().nonnegative(),
  superseded_by: z.string().nullable(),
  embedding: z.instanceof(Buffer).nullable(),
  deleted_at: z.number().int().nullable(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const ObservationInputSchema = z.object({
  id: z.string().min(1).optional(),
  project_id: z.string().min(1),
  session_id: z.string().min(1),
  kind: ObservationKind,
  title: z.string().min(1).max(80),
  body: z.string(),
  files: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  created_at: z.number().int().nonnegative().optional(),
  tokens_saved: z.number().int().nonnegative().default(0),
  tokens_spent: z.number().int().nonnegative().default(0),
});
export type ObservationInput = z.input<typeof ObservationInputSchema>;

export const CacheEntrySchema = z.object({
  id: z.string(),
  prompt_hash: z.string(),
  prompt_text: z.string(),
  prompt_embedding: z.instanceof(Buffer).nullable(),
  response: z.string(),
  model: z.string(),
  context_fingerprint: z.string(),
  fingerprint_version: z.number().int().nonnegative(),
  created_at: z.number().int(),
  last_hit_at: z.number().int(),
  hit_count: z.number().int().nonnegative(),
  false_hit_count: z.number().int().nonnegative(),
  invalidated: z.boolean(),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

export const CacheEntryInputSchema = z.object({
  prompt_hash: z.string(),
  prompt_text: z.string(),
  response: z.string(),
  model: z.string(),
  context_fingerprint: z.string(),
});
export type CacheEntryInput = z.input<typeof CacheEntryInputSchema>;

export const FileFingerprintSchema = z.object({
  path: z.string(),
  project_id: z.string(),
  content_hash: z.string(),
  mtime: z.number().int(),
  tokens: z.number().int(),
  summary: z.string().nullable(),
  summary_hash: z.string().nullable(),
});
export type FileFingerprint = z.infer<typeof FileFingerprintSchema>;

export const ExtractedObservationSchema = z.object({
  kind: ObservationKind,
  title: z.string().min(1).max(80),
  body: z.string().min(1),
  files: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type ExtractedObservation = z.infer<typeof ExtractedObservationSchema>;

export const ExtractorResponseSchema = z.object({
  observations: z.array(ExtractedObservationSchema),
});
export type ExtractorResponse = z.infer<typeof ExtractorResponseSchema>;

export const RetrievalStrategy = z.enum(['index', 'bm25', 'embeddings', 'hybrid']);
export type RetrievalStrategy = z.infer<typeof RetrievalStrategy>;

export const ConfigSchema = z.object({
  extraction: z
    .object({
      model: z.string().default('claude-haiku-4-5-20251001'),
      trigger: z.array(z.string()).default(['SessionEnd', 'PreCompact']),
      max_observations_per_session: z.number().int().positive().default(10),
      max_retries: z.number().int().nonnegative().default(1),
    })
    .default({}),
  cache: z
    .object({
      enabled: z.boolean().default(true),
      fuzzy_match: z.boolean().default(true),
      fuzzy_threshold: z.number().min(0).max(1).default(0.92),
      max_entries: z.number().int().positive().default(10_000),
      ttl_days: z.number().int().positive().default(90),
    })
    .default({}),
  retrieval: z
    .object({
      strategy: RetrievalStrategy.default('bm25'),
      k: z.number().int().positive().default(8),
      rerank_model: z.string().default('claude-haiku-4-5-20251001'),
      bm25: z.object({ enabled: z.boolean().default(true) }).default({}),
      embeddings: z
        .object({
          enabled: z.boolean().default(false),
          model: z.string().default('Xenova/bge-small-en-v1.5'),
        })
        .default({}),
      index: z
        .object({
          enabled: z.boolean().default(false),
          model: z.string().default('claude-haiku-4-5-20251001'),
        })
        .default({}),
    })
    .default({}),
  file_gating: z
    .object({
      enabled: z.boolean().default(false),
      min_file_size_tokens: z.number().int().positive().default(500),
      exclude_globs: z.array(z.string()).default(['**/*.env', '**/secrets/**']),
    })
    .default({}),
  privacy: z
    .object({
      telemetry: z.boolean().default(false),
      redact_patterns: z
        .array(z.string())
        .default([
          'api[_-]?key\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-]{8,}["\']?',
          'bearer\\s+[A-Za-z0-9_\\-.]+',
          'sk-[A-Za-z0-9_\\-]{20,}',
          'xox[baprs]-[A-Za-z0-9-]{10,}',
          'AKIA[0-9A-Z]{16}',
        ]),
    })
    .default({}),
  sync: z
    .object({
      enabled: z.boolean().default(false),
      backend: z.string().default('ssh'),
      remote: z.string().nullable().default(null),
    })
    .default({}),
});
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
