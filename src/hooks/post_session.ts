import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, GLOBAL_DIR } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { generateIndex } from '../core/index_gen.js';
import {
  extract,
  anthropicCaller,
  claudeCodeCaller,
  estimateTokensSaved,
  type LlmCaller,
} from '../core/extractor.js';
import { resolveProjectId, projectNameFromCwd } from '../core/project_id.js';
import { countTokens } from '../core/tokens.js';
import { projectDir } from '../config.js';
import { Bm25Retriever } from '../core/retriever/bm25.js';
import { parseTranscript, renderTurns, extractPromptResponsePairs } from '../core/transcript.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { ensureEmbedderConfigured } from '../core/embeddings_bootstrap.js';
import { embedMissing } from '../core/reindex.js';
import {
  FileFingerprintStore,
  matchesAnyGlob,
  statFile,
  summarizeFile,
  summaryHash,
} from '../core/file_summary.js';
import { writeMemoryMarkdown, memoriesDir } from '../core/memory_files.js';
import { deduplicateObservations } from '../core/dedup.js';
import type { Config } from '../core/schema.js';

export const HookPayloadSchema = z
  .object({
    session_id: z.string().optional(),
    cwd: z.string().optional(),
    project_id: z.string().optional(),
    transcript: z.string().optional(),
    transcript_path: z.string().optional(),
    // Claude Code includes these; we ignore them here but allow passthrough.
    hook_event_name: z.string().optional(),
  })
  .refine((v) => v.transcript !== undefined || v.transcript_path !== undefined, {
    message: 'Either `transcript` or `transcript_path` is required',
  });

export type HookPayload = z.infer<typeof HookPayloadSchema>;

export async function readToEnd(stream: NodeJS.ReadableStream): Promise<string> {
  // Claude Code sends the hook payload as a single JSON blob with no
  // trailing newline. Read to EOF; don't try to split on lines.
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface ResolvedTranscript {
  text: string;
  turns: ReturnType<typeof parseTranscript>;
}

function resolveTranscript(payload: HookPayload): ResolvedTranscript {
  const raw =
    payload.transcript !== undefined
      ? payload.transcript
      : payload.transcript_path !== undefined
        ? readFileSync(payload.transcript_path, 'utf8')
        : (() => {
            throw new Error('Unreachable: schema requires one of transcript | transcript_path');
          })();

  const turns = parseTranscript(raw);
  // If the parser found structured turns, render them compactly for the extractor.
  // Otherwise fall back to the raw string (plain-text transcript fixtures etc.).
  return { text: turns.length > 0 ? renderTurns(turns) : raw, turns };
}

function populateCache(
  db: DB,
  turns: ReturnType<typeof parseTranscript>,
  opts: { cwd: string; model: string; cache: Config['cache'] },
): number {
  const cache = new PromptCache(db);
  const pairs = extractPromptResponsePairs(turns);
  let inserted = 0;
  for (const pair of pairs) {
    if (pair.prompt.trim().length === 0 || pair.response.trim().length === 0) continue;
    const { fingerprint } = fingerprintFiles(pair.files_touched, { cwd: opts.cwd });
    cache.put({
      prompt_hash: hashPrompt(pair.prompt),
      prompt_text: pair.prompt,
      response: pair.response,
      model: opts.model,
      context_fingerprint: fingerprint,
      files_touched: pair.files_touched,
    });
    inserted += 1;
  }
  cache.prune({ ttlDays: opts.cache.ttl_days, maxEntries: opts.cache.max_entries });
  return inserted;
}

function collectSessionFiles(turns: ReturnType<typeof parseTranscript>): string[] {
  const set = new Set<string>();
  for (const t of turns) {
    for (const f of t.files_touched ?? []) set.add(f);
  }
  return [...set];
}

// At most this many file-summary LLM calls run concurrently. Serial was the
// original behaviour; 3 parallel cuts wall-clock time by ~3× for busy sessions
// without saturating the Haiku rate limit.
const SUMMARY_CONCURRENCY = 3;

async function populateFileSummaries(
  db: DB,
  turns: ReturnType<typeof parseTranscript>,
  opts: { cwd: string; projectId: string; config: Config; caller: LlmCaller },
): Promise<number> {
  const paths = collectSessionFiles(turns);
  if (paths.length === 0) return 0;
  const store = new FileFingerprintStore(db);
  const { exclude_globs, min_file_size_tokens } = opts.config.file_gating;

  // Build the work list synchronously (no I/O yet).
  interface WorkItem {
    path: string;
    contents: string;
    stat: NonNullable<ReturnType<typeof statFile>>;
  }
  const work: WorkItem[] = [];
  for (const path of paths) {
    if (matchesAnyGlob(path, exclude_globs)) continue;
    const stat = statFile(path, { cwd: opts.cwd });
    if (!stat || stat.tokens < min_file_size_tokens) continue;
    const existing = store.get(opts.projectId, path);
    if (existing && existing.content_hash === stat.contentHash && existing.summary) continue;
    const abs = isAbsolute(path) ? path : resolvePath(opts.cwd, path);
    let contents: string;
    try {
      contents = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    work.push({ path, contents, stat });
  }

  if (work.length === 0) return 0;

  // Process in concurrent batches to avoid the N×serial-latency problem while
  // still keeping pressure on the Haiku rate limit manageable.
  let generated = 0;
  for (let i = 0; i < work.length; i += SUMMARY_CONCURRENCY) {
    const batch = work.slice(i, i + SUMMARY_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ path, contents }) =>
        summarizeFile(path, contents, {
          model: opts.config.extraction.model,
          caller: opts.caller,
        }),
      ),
    );
    results.forEach((result, j) => {
      const item = batch[j]!;
      if (result.status === 'fulfilled') {
        store.upsert({
          project_id: opts.projectId,
          path: item.path,
          content_hash: item.stat.contentHash,
          mtime: item.stat.mtime,
          tokens: item.stat.tokens,
          summary: result.value.summary,
          summary_hash: summaryHash(result.value.summary),
        });
        generated += 1;
      } else {
        console.error(
          `[somtum] summarize ${item.path} failed: ${(result.reason as Error).message}`,
        );
      }
    });
  }
  return generated;
}

// Write top-k memories to a warm-start file after PreCompact so the next
// UserPromptSubmit can restore context into the fresh post-compaction session.
function writeWarmStart(db: DB, projectId: string, k = 8): void {
  try {
    const retriever = new Bm25Retriever(db);
    // Use a broad "recent" query — we want the most useful memories overall, not
    // query-specific ones, because we don't know what comes next.
    const results = retriever.search('recent decisions learnings bugs commands', {
      k,
      projectId,
    });
    // retriever.search is async but Bm25Retriever is synchronous under the hood;
    // we await-via-then to stay non-blocking.
    void Promise.resolve(results).then((hits) => {
      if (hits.length === 0) return;
      const lines = hits
        .map((r) => `[${r.observation.kind}] ${r.observation.title}\n${r.observation.body}`)
        .join('\n---\n');
      const context = `[somtum warm-start — context restored after compaction]\n${lines}\n[/somtum warm-start]`;
      const prefix = createHash('sha1').update(projectId).digest('hex').slice(0, 12);
      const dir = join(GLOBAL_DIR, 'warmstart');
      mkdirSync(dir, { recursive: true });
      // Include a timestamp so concurrent windows on the same project don't clobber each other.
      const path = join(dir, `ws_${prefix}_${Date.now()}.json`);
      writeFileSync(
        path,
        JSON.stringify({ project_id: projectId, created_at: Date.now(), context }),
        'utf8',
      );
    });
  } catch {
    // Non-fatal: warm-start is a best-effort enhancement.
  }
}

export interface RunOptions {
  cwd?: string;
  config?: Config;
  caller?: LlmCaller;
  db?: DB;
  dbPath?: string;
  indexPath?: string;
  projectName?: string;
  now?: number;
}

export interface RunResult {
  projectId: string;
  inserted: number;
  superseded: number;
  tokensSpent: number;
  tokensSavedTotal: number;
  indexPath: string;
  cacheEntriesAdded: number;
  embeddingsAdded: number;
  summariesGenerated: number;
}

export async function runPostSession(
  payload: HookPayload,
  opts: RunOptions = {},
): Promise<RunResult> {
  const parsed = HookPayloadSchema.parse(payload);
  const cwd = opts.cwd ?? parsed.cwd ?? process.cwd();
  const config = opts.config ?? loadConfig({ cwd });
  const projectId = parsed.project_id ?? resolveProjectId(cwd);
  const projectName = opts.projectName ?? projectNameFromCwd(cwd);
  const sessionId = parsed.session_id ?? ulid();

  const ownsDb = opts.db === undefined;
  const dir = opts.dbPath ? undefined : projectDir(projectId);
  const dbPath = opts.dbPath ?? join(dir!, 'db.sqlite');
  const indexPath = opts.indexPath ?? join(dir ?? '.', 'index.md');

  const db = opts.db ?? openDb({ path: dbPath });
  try {
    const store = new MemoryStore(db);

    const resolved = resolveTranscript(parsed);
    // Cap transcript size to stay within model context limits.
    // At ~4 chars/token, 60k tokens ≈ 240 KB of text. Anything beyond that
    // risks a context-limit error in Haiku; we take the tail (most recent turns).
    const MAX_TRANSCRIPT_TOKENS = 60_000;
    const rawTranscript = resolved.text;
    const transcript =
      countTokens(rawTranscript) > MAX_TRANSCRIPT_TOKENS
        ? (() => {
            const charBudget = MAX_TRANSCRIPT_TOKENS * 4;
            hookLog(
              `[post_session] WARN: transcript truncated to last ~${charBudget} chars (was ${rawTranscript.length})`,
            );
            return rawTranscript.slice(-charBudget);
          })()
        : rawTranscript;
    const transcriptTokens = countTokens(transcript);

    // Prefer the direct API when a key is present (faster, explicit model choice).
    // Fall back to the claude CLI so Claude Code subscribers need no separate key.
    const caller =
      opts.caller ??
      (() => {
        const apiKey = process.env['ANTHROPIC_API_KEY'];
        if (apiKey && apiKey.trim().length > 0) {
          // 25 s per API call — the SDK default is 600 s which lets a single
          // slow Haiku call block the hook process for 10 minutes.
          return anthropicCaller(new Anthropic({ apiKey, timeout: 25_000 }));
        }
        hookLog('[post_session] ANTHROPIC_API_KEY not set — using claude CLI fallback');
        return claudeCodeCaller();
      })();

    const outcome = await extract(transcript, caller, {
      model: config.extraction.model,
      maxObservations: config.extraction.max_observations_per_session,
      maxRetries: config.extraction.max_retries,
    });

    const total = outcome.observations.length;
    // Divide extraction cost across observations so per-observation tokens_spent adds up.
    const perObsSpend = total > 0 ? Math.floor(outcome.tokensSpent / total) : 0;

    const memDir = memoriesDir(
      opts.dbPath ? opts.dbPath.replace(/db\.sqlite$/, '') : projectDir(projectId),
    );

    let inserted = 0;
    const insertedIds: string[] = [];
    for (const obs of outcome.observations) {
      const saved = estimateTokensSaved(transcriptTokens, obs, total);
      const stored = store.insert(
        {
          project_id: projectId,
          session_id: sessionId,
          kind: obs.kind,
          title: obs.title,
          body: obs.body,
          files: obs.files,
          tags: obs.tags,
          tokens_saved: saved,
          tokens_spent: perObsSpend,
        },
        { redactPatterns: config.privacy.redact_patterns },
      );
      // Write the human-readable markdown mirror (SPEC.md §5.2).
      try {
        writeMemoryMarkdown(stored, memDir);
      } catch {
        // Non-fatal: SQLite is the source of truth.
      }
      insertedIds.push(stored.id);
      inserted += 1;
    }

    // M10: deduplicate — mark near-duplicate observations from prior sessions as superseded.
    const dedupResult = deduplicateObservations(db, projectId, insertedIds);

    const tokensSavedTotal = store.totalTokensSaved(projectId);

    const cacheEntriesAdded = config.cache.enabled
      ? populateCache(db, resolved.turns, { cwd, model: config.extraction.model, cache: config.cache })
      : 0;

    let embeddingsAdded = 0;
    if (config.retrieval.embeddings.enabled) {
      ensureEmbedderConfigured(config);
      try {
        const r = await embedMissing(db, projectId);
        embeddingsAdded = r.embedded;
      } catch (err) {
        console.error(`[somtum] embedding failed: ${(err as Error).message}`);
      }
    }

    const summariesGenerated = config.file_gating.enabled
      ? await populateFileSummaries(db, resolved.turns, { cwd, projectId, config, caller })
      : 0;

    generateIndex({
      projectName,
      projectId,
      totalTokensSaved: tokensSavedTotal,
      store,
      outputPath: indexPath,
      now: opts.now ?? Date.now(),
    });

    if (parsed.hook_event_name === 'PreCompact') {
      writeWarmStart(db, projectId);
    }

    return {
      projectId,
      inserted,
      superseded: dedupResult.superseded,
      tokensSpent: outcome.tokensSpent,
      tokensSavedTotal,
      indexPath,
      cacheEntriesAdded,
      embeddingsAdded,
      summariesGenerated,
    };
  } finally {
    if (ownsDb) db.close();
  }
}

function hookLog(msg: string): void {
  try {
    const logPath = join(GLOBAL_DIR, 'hook.log');
    const ts = new Date().toISOString();
    appendFileSync(logPath, `${ts} ${msg}\n`, 'utf8');
  } catch {
    // Non-fatal: logging must never break the hook.
  }
}

// FIX-05: track whether the first session has been processed and how many memories were found.
// Written once — subsequent sessions do not overwrite it.
function writeFirstSessionFlag(projectId: string, inserted: number): void {
  try {
    // Must match the read path in first_session_check.ts (projectDir is
    // SOMTUM_HOME-aware; a hardcoded ~/.somtum diverges when it's set).
    const flagPath = join(projectDir(projectId), 'first_session.json');
    // Only write if the flag does not already exist.
    try {
      const existing = JSON.parse(readFileSync(flagPath, 'utf8')) as Record<string, unknown>;
      if (existing['first_session_completed']) return;
    } catch {
      // File absent — fall through to write.
    }
    writeFileSync(
      flagPath,
      JSON.stringify({
        first_session_completed: true,
        first_session_inserted: inserted,
        first_session_timestamp: new Date().toISOString(),
      }),
      'utf8',
    );
  } catch {
    // Non-fatal.
  }
}

export async function main(): Promise<void> {
  hookLog('[post_session] starting');
  if (!process.env['ANTHROPIC_API_KEY']) {
    hookLog('[post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback');
  }
  try {
    const raw = await readToEnd(process.stdin);
    const payload = HookPayloadSchema.parse(JSON.parse(raw));
    const result = await runPostSession(payload);
    hookLog(
      `[post_session] ok — inserted=${result.inserted} superseded=${result.superseded} cache=${result.cacheEntriesAdded} summaries=${result.summariesGenerated}`,
    );
    writeFirstSessionFlag(result.projectId, result.inserted);
    // Hooks communicate via stdout; keep output structured.
    console.log(
      JSON.stringify({
        ok: true,
        inserted: result.inserted,
        superseded: result.superseded,
        cache_entries_added: result.cacheEntriesAdded,
        summaries_generated: result.summariesGenerated,
        tokens_spent_estimated: result.tokensSpent,
        tokens_saved_total_estimated: result.tokensSavedTotal,
      }),
    );
  } catch (err) {
    hookLog(`[post_session] ERROR: ${(err as Error).message}`);
    console.error(`[somtum] post_session failed: ${(err as Error).message}`);
    // Exit 0: hook failures should never break the user's session.
    process.exit(0);
  }
}

// Only run when invoked as a script, not when imported by tests.
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  void main();
}
