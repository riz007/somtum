import { createHash } from 'node:crypto';
import type { DB } from './db.js';
import type { Turn } from './transcript.js';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function prefixHash(turns: Turn[], n: number): string {
  const h = createHash('sha256');
  for (const t of turns.slice(0, n)) h.update(`${t.role}\u0000${t.text}\u0001`);
  return h.digest('hex');
}

export class SessionProgressStore {
  constructor(private readonly db: DB) {}

  // Index of the first turn not yet extracted. Returns 0 when the session is
  // new or its transcript no longer matches what was extracted (rewritten,
  // forked), so the caller falls back to a full extraction.
  resumeIndex(sessionId: string, turns: Turn[]): number {
    const row = this.db
      .prepare(`SELECT turns_extracted, prefix_hash FROM session_progress WHERE session_id = ?`)
      .get(sessionId) as { turns_extracted: number; prefix_hash: string } | undefined;
    if (!row || row.turns_extracted <= 0 || row.turns_extracted > turns.length) return 0;
    return prefixHash(turns, row.turns_extracted) === row.prefix_hash ? row.turns_extracted : 0;
  }

  markExtracted(sessionId: string, projectId: string, turns: Turn[], now = Date.now()): void {
    if (turns.length === 0) return;
    this.db
      .prepare(
        `INSERT INTO session_progress (session_id, project_id, turns_extracted, prefix_hash, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           turns_extracted = excluded.turns_extracted,
           prefix_hash = excluded.prefix_hash,
           updated_at = excluded.updated_at`,
      )
      .run(sessionId, projectId, turns.length, prefixHash(turns, turns.length), now);
    this.db.prepare(`DELETE FROM session_progress WHERE updated_at < ?`).run(now - RETENTION_MS);
  }
}
