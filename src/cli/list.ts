import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';
import { ObservationKind } from '../core/schema.js';
import type { ObservationKind as ObservationKindType } from '../core/schema.js';

const VALID_KINDS = new Set(ObservationKind.options);

export function listCommand(opts: {
  cwd?: string;
  dbPath?: string;
  projectId?: string;
  kind?: string;
  limit?: number;
  json?: boolean;
  showSuperseded?: boolean;
} = {}): number {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');

  if (!existsSync(dbPath)) {
    console.error('somtum: no database found — run `somtum init` first');
    return 1;
  }

  if (opts.kind && !VALID_KINDS.has(opts.kind as ObservationKindType)) {
    console.error(
      `somtum: unknown kind '${opts.kind}'. Valid values: ${[...VALID_KINDS].join(', ')}`,
    );
    return 1;
  }

  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);
    let observations = store.listByProject(projectId, {
      limit: opts.limit ?? 50,
      ...(opts.showSuperseded ? { includeSuperseded: true } : {}),
    });

    if (opts.kind) {
      observations = observations.filter((o) => o.kind === (opts.kind as ObservationKindType));
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          observations.map((o) => ({
            id: o.id,
            kind: o.kind,
            title: o.title,
            files: o.files,
            tags: o.tags,
            created_at: o.created_at,
          })),
          null,
          2,
        ),
      );
      return 0;
    }

    if (observations.length === 0) {
      console.log('No memories stored yet. Run a Claude session to capture observations.');
      return 0;
    }

    for (const o of observations) {
      const date = new Date(o.created_at).toISOString().slice(0, 10);
      const files = o.files.length > 0 ? `  [${o.files.slice(0, 2).join(', ')}]` : '';
      console.log(`${o.id}  ${o.kind.padEnd(12)}  ${date}  ${o.title}${files}`);
    }
    return 0;
  } finally {
    db.close();
  }
}
