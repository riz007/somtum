import { ulid } from 'ulid';
import type { DB } from './db.js';
import {
  ObservationInputSchema,
  ObservationUpdateSchema,
  ObservationSchema,
  type Observation,
  type ObservationInput,
  type ObservationUpdate,
  type ObservationKind,
  type ObservationScope,
} from './schema.js';
import { redactAll } from './privacy.js';

// DB row shape — kept internal; translate to/from Observation at the boundary.
interface ObservationRow {
  id: string;
  project_id: string;
  session_id: string;
  kind: ObservationKind;
  title: string;
  body: string;
  files: string;
  tags: string;
  created_at: number;
  tokens_saved: number;
  tokens_spent: number;
  superseded_by: string | null;
  embedding: Buffer | null;
  deleted_at: number | null;
  scope: ObservationScope;
  last_confirmed_at: number | null;
}

function rowToObservation(row: ObservationRow): Observation {
  return ObservationSchema.parse({
    id: row.id,
    project_id: row.project_id,
    session_id: row.session_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    files: JSON.parse(row.files) as string[],
    tags: JSON.parse(row.tags) as string[],
    created_at: row.created_at,
    tokens_saved: row.tokens_saved,
    tokens_spent: row.tokens_spent,
    superseded_by: row.superseded_by,
    embedding: row.embedding,
    deleted_at: row.deleted_at,
    scope: row.scope ?? 'project',
    last_confirmed_at: row.last_confirmed_at ?? null,
  });
}

export interface InsertOptions {
  redactPatterns?: string[];
}

export class MemoryStore {
  constructor(private readonly db: DB) {}

  insert(input: ObservationInput, options: InsertOptions = {}): Observation {
    const parsed = ObservationInputSchema.parse(input);

    const patterns = options.redactPatterns ?? [];
    const title = redactAll(parsed.title, patterns);
    const body = redactAll(parsed.body, patterns);

    const id = parsed.id ?? ulid();
    const created_at = parsed.created_at ?? Date.now();
    const scope = parsed.scope ?? 'project';

    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO observations
             (id, project_id, session_id, kind, title, body, files, tags,
              created_at, tokens_saved, tokens_spent, superseded_by, embedding, deleted_at,
              scope, last_confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)`,
        )
        .run(
          id,
          parsed.project_id,
          parsed.session_id,
          parsed.kind,
          title,
          body,
          JSON.stringify(parsed.files),
          JSON.stringify(parsed.tags),
          created_at,
          parsed.tokens_saved,
          parsed.tokens_spent,
          scope,
        );
    });
    txn.immediate();

    return this.get(id)!;
  }

  update(id: string, patch: ObservationUpdate, options: InsertOptions = {}): Observation | null {
    const parsed = ObservationUpdateSchema.parse(patch);
    const existing = this.get(id);
    if (!existing || existing.deleted_at !== null) return null;

    const patterns = options.redactPatterns ?? [];
    const title = parsed.title !== undefined ? redactAll(parsed.title, patterns) : existing.title;
    const body = parsed.body !== undefined ? redactAll(parsed.body, patterns) : existing.body;
    const files =
      parsed.files !== undefined ? JSON.stringify(parsed.files) : JSON.stringify(existing.files);
    const tags =
      parsed.tags !== undefined ? JSON.stringify(parsed.tags) : JSON.stringify(existing.tags);

    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE observations SET title = ?, body = ?, files = ?, tags = ? WHERE id = ?`,
        )
        .run(title, body, files, tags, id);
    });
    txn.immediate();

    return this.get(id);
  }

  // Bump last_confirmed_at to signal that this memory was retrieved and was useful.
  confirmRetrieval(id: string, now: number = Date.now()): void {
    this.db
      .prepare(`UPDATE observations SET last_confirmed_at = ? WHERE id = ?`)
      .run(now, id);
  }

  // Observations that have never been confirmed and are older than olderThanDays.
  listStale(
    projectId: string,
    olderThanDays: number,
    opts: { limit?: number } = {},
  ): Observation[] {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE project_id = ? AND deleted_at IS NULL
           AND last_confirmed_at IS NULL AND created_at < ?
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(projectId, cutoff, Math.floor(opts.limit ?? 100)) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  countStale(projectId: string, olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM observations
         WHERE project_id = ? AND deleted_at IS NULL
           AND last_confirmed_at IS NULL AND created_at < ?`,
      )
      .get(projectId, cutoff) as { n: number };
    return row.n;
  }

  // All non-deleted observations with scope = 'workspace' or 'global' for any project.
  listByScope(scope: ObservationScope, limit = 50): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE scope = ? AND deleted_at IS NULL
         ORDER BY tokens_saved DESC, created_at DESC LIMIT ?`,
      )
      .all(scope, Math.floor(limit)) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  get(id: string): Observation | null {
    const row = this.db.prepare(`SELECT * FROM observations WHERE id = ?`).get(id) as
      | ObservationRow
      | undefined;
    return row ? rowToObservation(row) : null;
  }

  listByProject(
    projectId: string,
    options: { includeDeleted?: boolean; limit?: number } = {},
  ): Observation[] {
    const where = options.includeDeleted
      ? `WHERE project_id = ?`
      : `WHERE project_id = ? AND deleted_at IS NULL`;
    const limit = options.limit ? `LIMIT ${Math.floor(options.limit)}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM observations ${where} ORDER BY created_at DESC ${limit}`)
      .all(projectId) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  softDelete(id: string): boolean {
    const info = this.db
      .prepare(`UPDATE observations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(Date.now(), id);
    return info.changes > 0;
  }

  countByProject(projectId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM observations WHERE project_id = ? AND deleted_at IS NULL`)
      .get(projectId) as { n: number };
    return row.n;
  }

  setEmbedding(id: string, embedding: Buffer): void {
    this.db.prepare(`UPDATE observations SET embedding = ? WHERE id = ?`).run(embedding, id);
  }

  listMissingEmbeddings(projectId: string, limit: number = 1000): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE project_id = ? AND deleted_at IS NULL AND embedding IS NULL
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(projectId, Math.floor(limit)) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  listWithEmbeddings(projectId: string): { id: string; embedding: Buffer }[] {
    const rows = this.db
      .prepare(
        `SELECT id, embedding FROM observations
         WHERE project_id = ? AND deleted_at IS NULL AND embedding IS NOT NULL`,
      )
      .all(projectId) as { id: string; embedding: Buffer }[];
    return rows;
  }

  countByKind(projectId: string): Record<ObservationKind, number> {
    const rows = this.db
      .prepare(
        `SELECT kind, COUNT(*) AS n FROM observations
         WHERE project_id = ? AND deleted_at IS NULL
         GROUP BY kind`,
      )
      .all(projectId) as { kind: ObservationKind; n: number }[];
    const out = {
      decision: 0,
      learning: 0,
      bugfix: 0,
      file_summary: 0,
      command: 0,
      other: 0,
    } as Record<ObservationKind, number>;
    for (const r of rows) out[r.kind] = r.n;
    return out;
  }

  totalTokensSaved(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_saved), 0) AS total FROM observations
         WHERE project_id = ? AND deleted_at IS NULL`,
      )
      .get(projectId) as { total: number };
    return row.total;
  }

  totalTokensSpent(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_spent), 0) AS total FROM observations
         WHERE project_id = ? AND deleted_at IS NULL`,
      )
      .get(projectId) as { total: number };
    return row.total;
  }

  // Hard-delete rows that were soft-deleted before `olderThanMs`.
  // Returns the number of rows removed.
  purge(projectId: string, olderThanMs: number): number {
    const info = this.db
      .prepare(
        `DELETE FROM observations
         WHERE project_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`,
      )
      .run(projectId, olderThanMs);
    return info.changes;
  }

  // Observations newer than `sinceMs`, most-recent first.
  listRecent(projectId: string, sinceMs: number, limit = 100): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE project_id = ? AND deleted_at IS NULL AND created_at >= ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, sinceMs, Math.floor(limit)) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  // Latest N observations of a given kind.
  listByKind(projectId: string, kind: ObservationKind, limit = 50): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE project_id = ? AND kind = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, kind, Math.floor(limit)) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  // Top N most-referenced files with observation ID lists.
  // Uses SQLite json_each to unnest the files JSON array.
  topFileReferences(
    projectId: string,
    limit = 20,
  ): { file: string; count: number; ids: string[] }[] {
    // Two-phase: first count per file, then collect IDs for the top files.
    const countRows = this.db
      .prepare(
        `SELECT f.value AS file, COUNT(*) AS cnt
         FROM observations o, json_each(o.files) AS f
         WHERE o.project_id = ? AND o.deleted_at IS NULL
         GROUP BY f.value
         ORDER BY cnt DESC
         LIMIT ?`,
      )
      .all(projectId, Math.floor(limit)) as { file: string; cnt: number }[];

    return countRows.map(({ file, cnt }) => {
      const idRows = this.db
        .prepare(
          `SELECT o.id FROM observations o, json_each(o.files) AS f
           WHERE o.project_id = ? AND o.deleted_at IS NULL AND f.value = ?
           ORDER BY o.created_at DESC`,
        )
        .all(projectId, file) as { id: string }[];
      return { file, count: cnt, ids: idRows.map((r) => r.id) };
    });
  }
}
