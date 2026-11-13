import type { DB } from './db.js';
import { MemoryStore } from './store.js';
import type { ObservationKind } from './schema.js';

// Jaccard similarity on content words (len > 2, lowercased).
// Returns 0..1 where 1 = identical word-sets.
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    );
  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

// Minimum title Jaccard to consider two observations near-duplicates.
export const TITLE_SIM_THRESHOLD = 0.6;

export interface DedupResult {
  superseded: number;
  pairs: Array<{ oldId: string; newId: string; similarity: number }>;
}

/**
 * After inserting a batch of new observations, find near-duplicates among
 * earlier observations (different session, same kind) and mark them as
 * superseded by the new version.
 *
 * Conservative: only marks the OLDER observation superseded — never the new one.
 * Only compares title similarity; body content is not checked to stay fast.
 */
// A branch may only supersede its own memories. Otherwise an experiment that is
// later thrown away could hide a decision that still stands on the default
// branch. Memories without a branch (older or non-git) are only superseded from
// the default branch. Conflicts between branches are settled at recall instead.
function maySupersede(
  newer: { git_branch: string | null },
  older: { git_branch: string | null },
  defaultBranch: string | null,
): boolean {
  if (older.git_branch === newer.git_branch) return true;
  return older.git_branch === null && newer.git_branch === defaultBranch;
}

export function deduplicateObservations(
  db: DB,
  projectId: string,
  newIds: string[],
  opts: { defaultBranch?: string | null } = {},
): DedupResult {
  if (newIds.length === 0) return { superseded: 0, pairs: [] };

  const store = new MemoryStore(db);
  const pairs: Array<{ oldId: string; newId: string; similarity: number }> = [];

  for (const newId of newIds) {
    const newObs = store.get(newId);
    if (!newObs || newObs.deleted_at !== null || newObs.superseded_by !== null) continue;

    // Candidate pool: same kind, not deleted, not superseded, from a different session.
    const candidates = store
      .listByKind(projectId, newObs.kind as ObservationKind, 200)
      .filter((o) => o.id !== newId && o.session_id !== newObs.session_id);

    for (const candidate of candidates) {
      const sim = titleSimilarity(newObs.title, candidate.title);
      if (sim < TITLE_SIM_THRESHOLD) continue;

      // The older of the two is superseded. Usually that's the candidate, but a
      // backfilled past session can be older than what is already stored.
      const [older, newer] =
        candidate.created_at <= newObs.created_at ? [candidate, newObs] : [newObs, candidate];
      if (!maySupersede(newer, older, opts.defaultBranch ?? null)) continue;
      store.markSuperseded(older.id, newer.id);
      pairs.push({ oldId: older.id, newId: newer.id, similarity: sim });
      break; // one supersession per new observation is enough
    }
  }

  return { superseded: pairs.length, pairs };
}
