import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { resolveProjectId } from '../core/project_id.js';
import { projectDir } from '../config.js';

function parseOlderThan(value: string): number {
  const match = value.match(/^(\d+)(d|h|m)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`invalid --older-than value "${value}". Use e.g. 30d, 24h, 60m.`);
  }
  const n = Number.parseInt(match[1], 10);
  const unit = match[2];
  const msPerUnit: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 };
  return n * (msPerUnit[unit] ?? 0);
}

export function runPurge(opts: {
  olderThan: string;
  cwd?: string;
  dbPath?: string;
  projectId?: string;
  dryRun?: boolean;
}): { purged: number } {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const ageMs = parseOlderThan(opts.olderThan);
  const cutoff = Date.now() - ageMs;

  const db = openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);

    if (opts.dryRun) {
      // Count what would be removed without deleting.
      const wouldDelete = db
        .prepare(
          `SELECT COUNT(*) AS n FROM observations
           WHERE project_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`,
        )
        .get(projectId, cutoff) as { n: number };
      return { purged: wouldDelete.n };
    }

    const purged = store.purge(projectId, cutoff);
    return { purged };
  } finally {
    db.close();
  }
}

export function purgeCommand(
  options: { olderThan: string; dryRun?: boolean; json?: boolean; cwd?: string } = {
    olderThan: '30d',
  },
): number {
  let result: { purged: number };
  try {
    const purgeOpts: Parameters<typeof runPurge>[0] = {
      olderThan: options.olderThan,
      cwd: options.cwd ?? process.cwd(),
    };
    if (options.dryRun !== undefined) purgeOpts.dryRun = options.dryRun;
    result = runPurge(purgeOpts);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  if (options.json) {
    console.log(JSON.stringify({ ...result, dry_run: options.dryRun ?? false }));
    return 0;
  }

  if (options.dryRun) {
    console.log(
      `dry run: ${result.purged} soft-deleted observation(s) older than ${options.olderThan} would be removed`,
    );
  } else {
    console.log(
      `purged ${result.purged} soft-deleted observation(s) older than ${options.olderThan}`,
    );
  }
  return 0;
}
