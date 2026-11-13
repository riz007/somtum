import { BranchView } from './git_context.js';
import { titleSimilarity, TITLE_SIM_THRESHOLD } from './dedup.js';
import type { Observation } from './schema.js';

type WithObservation = { observation: Observation };

// Drops memories captured on another branch that still exists and hasn't been
// merged into the current one. Git is only consulted when a candidate was
// captured on a branch, so stores from before 3.2 pay nothing.
export function scopeToBranch<T extends WithObservation>(
  results: T[],
  cwd: string,
  view?: BranchView | null,
): T[] {
  if (!results.some((r) => r.observation.git_branch)) return results;
  const v = view === undefined ? BranchView.load(cwd) : view;
  if (!v) return results;
  return results.filter((r) => v.isVisible(r.observation));
}

// When two visible memories are near-duplicates of the same kind (typically the
// same decision made on two branches that have since merged), keep the newer.
export function newestOfDuplicates<T extends WithObservation>(results: T[]): T[] {
  const kept: T[] = [];
  const byAge = [...results].sort((a, b) => b.observation.created_at - a.observation.created_at);
  const stale = new Set<string>();
  for (const r of byAge) {
    const dup = kept.some(
      (k) =>
        k.observation.kind === r.observation.kind &&
        titleSimilarity(k.observation.title, r.observation.title) >= TITLE_SIM_THRESHOLD,
    );
    if (dup) stale.add(r.observation.id);
    else kept.push(r);
  }
  return results.filter((r) => !stale.has(r.observation.id));
}
