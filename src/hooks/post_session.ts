import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { MemoryStore } from '../core/store.js';
import { generateIndex } from '../core/index_gen.js';
import { extract, anthropicCaller, estimateTokensSaved, type LlmCaller } from '../core/extractor.js';
import { resolveProjectId, projectNameFromCwd } from '../core/project_id.js';
import { countTokens } from '../core/tokens.js';
import { projectDir } from '../config.js';
import { parseTranscript, renderTurns, extractPromptResponsePairs } from '../core/transcript.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
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
}

export async function runPostSession(payload: HookPayload, opts: RunOptions = {}): Promise<RunResult> {
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

    const caller =
      opts.caller ??
      anthropicCaller(
        new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '' }),
      );

    const outcome = await extract(transcript, caller, {
      model: config.extraction.model,
      maxObservations: config.extraction.max_observations_per_session,
      maxRetries: config.extraction.max_retries,
    });

    const total = outcome.observations.length;
    // Divide extraction cost across observations so per-observation tokens_spent adds up.
    const perObsSpend = total > 0 ? Math.floor(outcome.tokensSpent / total) : 0;

    let inserted = 0;
    for (const obs of outcome.observations) {
      const saved = estimateTokensSaved(transcriptTokens, obs, total);
      store.insert(
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
      inserted += 1;
    }

    const tokensSavedTotal = store.totalTokensSaved(projectId);

    const cacheEntriesAdded = config.cache.enabled
      ? populateCache(db, resolved.turns, { cwd, model: config.extraction.model })
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
    };
  } finally {
    if (ownsDb) db.close();
  }
}

export async function main(): Promise<void> {
  try {
    const raw = await readToEnd(process.stdin);
    const payload = HookPayloadSchema.parse(JSON.parse(raw));
    const result = await runPostSession(payload);
    // Hooks communicate via stdout; keep output structured.
    console.log(
      JSON.stringify({
        ok: true,
        inserted: result.inserted,
        cache_entries_added: result.cacheEntriesAdded,
        tokens_spent_estimated: result.tokensSpent,
        tokens_saved_total_estimated: result.tokensSavedTotal,
      }),
    );
  } catch (err) {
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
