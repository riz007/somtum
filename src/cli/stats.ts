import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { openDb } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { PromptCache } from '../core/cache.js';
import { RetrievalStatsStore } from '../core/retrieval_stats.js';
import { TokenLedger, type LedgerSummary } from '../core/ledger.js';
import { resolveProjectId } from '../core/project_id.js';
import { pickBackend } from '../core/llm_backend.js';
import { loadConfig, projectDir, globalDbPath, GLOBAL_PROJECT_ID } from '../config.js';

export interface StatsSnapshot {
  project_id: string;
  memories: number;
  global_memories: number;
  by_kind: Record<string, number>;
  cache_entries: number;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate: number | null;
  retrieval_by_strategy: Array<{ strategy: string; call_count: number }>;
  // Metered: recorded where the tokens were spent or avoided.
  ledger: LedgerSummary;
  // Heuristic: a model of what memories might replace, not a measurement.
  tokens_saved_estimated: number;
  tokens_spent_estimated: number;
  net_estimated: number;
  breakeven_ratio_estimated: number | null;
}

export function collectStats(
  opts: { cwd?: string; dbPath?: string; projectId?: string; since?: number } = {},
): StatsSnapshot {
  const cwd = opts.cwd ?? process.cwd();
  const projectId = opts.projectId ?? resolveProjectId(cwd);
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = openDb({ path: dbPath });
  const gPath = globalDbPath();
  const globalDb = existsSync(gPath) ? openDb({ path: gPath }) : null;
  try {
    const store = new MemoryStore(db);
    const cache = new PromptCache(db);
    const statsStore = new RetrievalStatsStore(db);
    const saved = store.totalTokensSaved(projectId);
    const spent = store.totalTokensSpent(projectId);
    const cacheHits = statsStore.getCacheHitSummary(projectId);
    const retrievalBreakdown = statsStore.getRetrievalBreakdown(projectId);
    const globalMemories = globalDb
      ? new MemoryStore(globalDb).countByProject(GLOBAL_PROJECT_ID)
      : 0;
    const ledgerOpts = opts.since !== undefined ? { since: opts.since } : {};
    return {
      project_id: projectId,
      memories: store.countByProject(projectId),
      global_memories: globalMemories,
      by_kind: store.countByKind(projectId),
      cache_entries: cache.count(),
      cache_hits: cacheHits.hit_count,
      cache_misses: cacheHits.miss_count,
      cache_hit_rate: cacheHits.hit_rate,
      retrieval_by_strategy: retrievalBreakdown,
      ledger: new TokenLedger(db).summary(projectId, ledgerOpts),
      tokens_saved_estimated: saved,
      tokens_spent_estimated: spent,
      net_estimated: saved - spent,
      breakeven_ratio_estimated: spent > 0 ? Number((saved / spent).toFixed(2)) : null,
    };
  } finally {
    db.close();
    globalDb?.close();
  }
}

const n = (v: number): string => v.toLocaleString('en-US');
const row = (label: string, count: string, tokens: string, note = ''): string =>
  `  ${label.padEnd(18)} ${count.padStart(10)} ${tokens.padStart(14)}${note ? `   ${note}` : ''}`;

function printHuman(s: StatsSnapshot, sinceLabel: string): void {
  console.log(`project        ${s.project_id}`);
  console.log(
    `memories       ${s.memories}${s.global_memories > 0 ? `   (global: ${s.global_memories})` : ''}`,
  );
  for (const [k, c] of Object.entries(s.by_kind)) {
    if (c > 0) console.log(`  ${k.padEnd(15)} ${c}`);
  }

  const l = s.ledger;
  console.log('');
  console.log(`Somtum's own token use, metered (${sinceLabel})`);
  const skipped = l.extraction_skipped.events > 0 ? `${l.extraction_skipped.events} skipped` : '';
  console.log(
    row('extraction', `${l.extraction.events} calls`, `${n(l.extraction.tokens)} tok`, skipped),
  );
  if (l.file_summary.events > 0) {
    console.log(
      row('file summaries', `${l.file_summary.events} calls`, `${n(l.file_summary.tokens)} tok`),
    );
  }
  console.log(
    row(
      'injected context',
      `${l.injection.events} prompts`,
      `${n(l.injection.tokens)} tok`,
      "added to your agent's input",
    ),
  );
  console.log(row('total', '', `${n(l.overhead_tokens)} tok`));

  const g = l.file_gate;
  if (g.denied.events > 0) {
    console.log('');
    console.log(`File gating, metered (${sinceLabel})`);
    console.log(row('full reads avoided', `${g.denied.events}`, `${n(g.denied.tokens)} tok`));
    console.log(row('summaries shown', `${g.summary.events}`, `-${n(g.summary.tokens)} tok`));
    console.log(row('read anyway', `${g.reread.events}`, `-${n(g.reread.tokens)} tok`));
    const verdict = g.net_tokens >= 0 ? 'saved' : 'lost — consider turning file gating off';
    console.log(
      row('net', '', `${g.net_tokens >= 0 ? '' : '-'}${n(Math.abs(g.net_tokens))} tok`, verdict),
    );
  }

  if (s.cache_entries > 0 || s.cache_hits > 0) {
    console.log('');
    const hitRate = s.cache_hit_rate !== null ? `${(s.cache_hit_rate * 100).toFixed(1)}%` : 'n/a';
    console.log(
      `prompt cache   ${s.cache_entries} entries · ${s.cache_hits} hits · ${s.cache_misses} misses · ${hitRate} hit rate`,
    );
  }

  if (s.retrieval_by_strategy.length > 0) {
    console.log(
      `retrieval      ${s.retrieval_by_strategy.map((r) => `${r.strategy} ${r.call_count}`).join(' · ')}`,
    );
  }

  console.log('');
  console.log(
    `estimate       ~${n(s.tokens_saved_estimated)} tokens of context replaced by memories`,
  );
  console.log(
    '               (a heuristic, not a measurement: see https://riz007.github.io/somtum/guide/costs)',
  );
}

function parseSince(raw: string | undefined): { since?: number; label: string } {
  if (!raw) return { label: 'all time' };
  const m = /^(\d+)d$/.exec(raw.trim());
  if (!m) throw new Error(`--since expects a number of days like 7d, got "${raw}"`);
  const days = Number(m[1]);
  return { since: Date.now() - days * 24 * 60 * 60 * 1000, label: `last ${days} days` };
}

export function statsCommand(
  options: { json?: boolean; cwd?: string; since?: string } = {},
): number {
  const cwd = options.cwd ?? process.cwd();
  let window: { since?: number; label: string };
  try {
    window = parseSince(options.since);
  } catch (err) {
    console.error(`somtum: ${(err as Error).message}`);
    return 1;
  }
  const snap = collectStats(window.since !== undefined ? { cwd, since: window.since } : { cwd });
  if (options.json) {
    console.log(JSON.stringify(snap, null, 2));
    return 0;
  }
  printHuman(snap, window.label);
  if (snap.memories === 0) {
    console.log('');
    if (!pickBackend(loadConfig({ cwd }))) {
      console.log('hint: no extraction backend is available, so sessions cannot be captured.');
      console.log('      Install the claude or codex CLI, or set ANTHROPIC_API_KEY in your shell');
      console.log('      profile. Check the full setup with: somtum doctor');
    } else {
      console.log('hint: no memories yet. They are extracted when a session ends or compacts.');
      console.log('      Run `somtum doctor` if a session has ended and this is still empty.');
    }
  }
  return 0;
}
