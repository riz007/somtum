import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type { DB } from './db.js';
import { CacheEntrySchema, type CacheEntry, type CacheEntryInput } from './schema.js';
import {
  cosineSimilarity,
  decodeVector,
  encodeVector,
  type Embedder,
} from './embeddings.js';

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
  files_touched: string;
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
    files_touched: JSON.parse(row.files_touched) as string[],
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

  put(input: CacheEntryInput & { prompt_embedding?: Buffer }): CacheEntry {
    const id = ulid();
    const now = Date.now();
    const filesTouched = JSON.stringify(input.files_touched ?? []);
    this.db
      .prepare(
        `INSERT INTO cache_entries
           (id, prompt_hash, prompt_text, prompt_embedding, response, model,
            context_fingerprint, fingerprint_version, created_at, last_hit_at,
            hit_count, false_hit_count, invalidated, files_touched)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
         ON CONFLICT(prompt_hash) DO UPDATE SET
           response = excluded.response,
           model = excluded.model,
           context_fingerprint = excluded.context_fingerprint,
           fingerprint_version = excluded.fingerprint_version,
           last_hit_at = excluded.last_hit_at,
           files_touched = excluded.files_touched,
           prompt_embedding = COALESCE(excluded.prompt_embedding, cache_entries.prompt_embedding),
           invalidated = 0`,
      )
      .run(
        id,
        input.prompt_hash,
        input.prompt_text,
        input.prompt_embedding ?? null,
        input.response,
        input.model,
        input.context_fingerprint,
        CACHE_FINGERPRINT_VERSION,
        now,
        now,
        filesTouched,
      );

    const entry = this.lookupByHash(input.prompt_hash);
    if (!entry) throw new Error('PromptCache.put: readback failed');
    return entry;
  }

  // Nearest-neighbor fuzzy match over stored prompt embeddings. Returns the
  // best hit with similarity >= threshold, or null. The caller is expected
  // to validate the file-fingerprint before treating it as a true hit.
  async lookupFuzzy(
    prompt: string,
    embedder: Embedder,
    threshold: number,
  ): Promise<{ entry: CacheEntry; similarity: number } | null> {
    const rows = this.db
      .prepare(
        `SELECT id, prompt_embedding FROM cache_entries
         WHERE invalidated = 0 AND prompt_embedding IS NOT NULL`,
      )
      .all() as { id: string; prompt_embedding: Buffer }[];
    if (rows.length === 0) return null;

    const [qv] = await embedder.embed([prompt]);
    if (!qv) return null;

    let bestId: string | null = null;
    let bestSim = -Infinity;
    for (const row of rows) {
      const v = decodeVector(row.prompt_embedding, embedder.dim);
      const s = cosineSimilarity(qv, v);
      if (s > bestSim) {
        bestSim = s;
        bestId = row.id;
      }
    }
    if (!bestId || bestSim < threshold) return null;
    const entry = this.getById(bestId);
    if (!entry) return null;
    return { entry, similarity: bestSim };
  }

  getById(id: string): CacheEntry | null {
    const row = this.db
      .prepare(`SELECT * FROM cache_entries WHERE id = ?`)
      .get(id) as CacheRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  setPromptEmbedding(id: string, v: Float32Array): void {
    this.db
      .prepare(`UPDATE cache_entries SET prompt_embedding = ? WHERE id = ?`)
      .run(encodeVector(v), id);
  }

  listMissingPromptEmbeddings(): { id: string; prompt_text: string }[] {
    return this.db
      .prepare(
        `SELECT id, prompt_text FROM cache_entries
         WHERE prompt_embedding IS NULL AND invalidated = 0`,
      )
      .all() as { id: string; prompt_text: string }[];
  }

  recordFalseHit(id: string): void {
    this.db
      .prepare(`UPDATE cache_entries SET false_hit_count = false_hit_count + 1 WHERE id = ?`)
      .run(id);
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
