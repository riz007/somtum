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

function resolveTranscript(payload: HookPayload): string {
  if (payload.transcript !== undefined) return payload.transcript;
  if (payload.transcript_path !== undefined) return readFileSync(payload.transcript_path, 'utf8');
  throw new Error('Unreachable: schema requires one of transcript | transcript_path');
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

    const transcript = resolveTranscript(parsed);
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

    generateIndex({
      projectName,
      projectId,
      totalTokensSaved: tokensSavedTotal,
      store,
      outputPath: indexPath,
      now: opts.now ?? Date.now(),
    });

    return { projectId, inserted, tokensSpent: outcome.tokensSpent, tokensSavedTotal, indexPath };
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
