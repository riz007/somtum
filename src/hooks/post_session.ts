import { readFileSync, appendFileSync } from 'node:fs';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import { ulid } from 'ulid';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { generateIndex } from '../core/index_gen.js';
import {
  extract,
  anthropicCaller,
  estimateTokensSaved,
  type LlmCaller,
} from '../core/extractor.js';
import { resolveProjectId, projectNameFromCwd } from '../core/project_id.js';
import { countTokens } from '../core/tokens.js';
import { projectDir } from '../config.js';
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
  opts: { cwd: string; model: string },
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
    const transcript = resolved.text;
    const transcriptTokens = countTokens(transcript);

    // 25 s per API call — the SDK default is 600 s which lets a single slow
    // Haiku call block the hook process for 10 minutes.
    const caller =
      opts.caller ??
      anthropicCaller(
        new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '', timeout: 25_000 }),
      );

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
      inserted += 1;
    }

    const tokensSavedTotal = store.totalTokensSaved(projectId);

    const cacheEntriesAdded = config.cache.enabled
      ? populateCache(db, resolved.turns, { cwd, model: config.extraction.model })
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

    return {
      projectId,
      inserted,
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
    const logPath = join(homedir(), '.somtum', 'hook.log');
    const ts = new Date().toISOString();
    appendFileSync(logPath, `${ts} ${msg}\n`, 'utf8');
  } catch {
    // Non-fatal: logging must never break the hook.
  }
}

export async function main(): Promise<void> {
  hookLog('[post_session] starting');
  if (!process.env['ANTHROPIC_API_KEY']) {
    hookLog(
      '[post_session] WARN: ANTHROPIC_API_KEY is not set — extraction will fail. Add it to your shell profile.',
    );
  }
  try {
    const raw = await readToEnd(process.stdin);
    const payload = HookPayloadSchema.parse(JSON.parse(raw));
    const result = await runPostSession(payload);
    hookLog(
      `[post_session] ok — inserted=${result.inserted} cache=${result.cacheEntriesAdded} summaries=${result.summariesGenerated}`,
    );
    // Hooks communicate via stdout; keep output structured.
    console.log(
      JSON.stringify({
        ok: true,
        inserted: result.inserted,
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
