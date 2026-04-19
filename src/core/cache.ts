import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type { DB } from './db.js';
import { CacheEntrySchema, type CacheEntry, type CacheEntryInput } from './schema.js';

// Bump on any change to how context_fingerprint is computed. On bump,
// invalidate all existing cache entries at next startup.
export const CACHE_FINGERPRINT_VERSION = 1;

interface CacheRow {
  id: string;
  prompt_hash: string;
  prompt_text: string;
  prompt_embedding: Buffer | null;
  response: string;
  model: string;
  context_fingerprint: string;
  fingerprint_version: number;
  created_at: number;
  last_hit_at: number;
  hit_count: number;
  false_hit_count: number;
  invalidated: number;
}

function rowToEntry(row: CacheRow): CacheEntry {
  return CacheEntrySchema.parse({
    id: row.id,
    prompt_hash: row.prompt_hash,
    prompt_text: row.prompt_text,
    prompt_embedding: row.prompt_embedding,
    response: row.response,
    model: row.model,
    context_fingerprint: row.context_fingerprint,
    fingerprint_version: row.fingerprint_version,
    created_at: row.created_at,
    last_hit_at: row.last_hit_at,
    hit_count: row.hit_count,
    false_hit_count: row.false_hit_count,
    invalidated: row.invalidated === 1,
  });
}

export function normalizePrompt(prompt: string): string {
  // Minimal normalization: collapse runs of whitespace and trim.
  // The fuller form (case-folding commands, preserving quoted strings)
  // lands when fuzzy matching does.
  return prompt.trim().replace(/\s+/g, ' ');
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(normalizePrompt(prompt)).digest('hex');
}

export class PromptCache {
  constructor(private readonly db: DB) {}

  lookupByHash(promptHash: string): CacheEntry | null {
    const row = this.db
      .prepare(
        `SELECT * FROM cache_entries
         WHERE prompt_hash = ? AND invalidated = 0`,
      )
      .get(promptHash) as CacheRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  put(input: CacheEntryInput): CacheEntry {
    const id = ulid();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO cache_entries
           (id, prompt_hash, prompt_text, prompt_embedding, response, model,
            context_fingerprint, fingerprint_version, created_at, last_hit_at,
            hit_count, false_hit_count, invalidated)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 0, 0)
         ON CONFLICT(prompt_hash) DO UPDATE SET
           response = excluded.response,
           model = excluded.model,
           context_fingerprint = excluded.context_fingerprint,
           fingerprint_version = excluded.fingerprint_version,
           last_hit_at = excluded.last_hit_at,
           invalidated = 0`,
      )
      .run(
        id,
        input.prompt_hash,
        input.prompt_text,
        input.response,
        input.model,
        input.context_fingerprint,
        CACHE_FINGERPRINT_VERSION,
        now,
        now,
      );

    const entry = this.lookupByHash(input.prompt_hash);
    if (!entry) throw new Error('PromptCache.put: readback failed');
    return entry;
  }

  touch(id: string): void {
    this.db
      .prepare(
        `UPDATE cache_entries SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
  }

  invalidate(id: string): void {
    this.db.prepare(`UPDATE cache_entries SET invalidated = 1 WHERE id = ?`).run(id);
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM cache_entries`).get() as {
      n: number;
    };
    return row.n;
  }
}
