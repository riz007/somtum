import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig, projectDir } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { resolveProjectId } from '../core/project_id.js';
import { ensureEmbedderConfigured } from '../core/embeddings_bootstrap.js';
import { getEmbedder, isEmbedderReady } from '../core/embeddings.js';
import type { Config, CacheEntry } from '../core/schema.js';

// Claude Code's UserPromptSubmit hook payload. We accept both `prompt`
// (newer shape) and `user_prompt` (older) to tolerate version drift.
export const PrePromptPayloadSchema = z
  .object({
    prompt: z.string().optional(),
    user_prompt: z.string().optional(),
    cwd: z.string().optional(),
    project_id: z.string().optional(),
    hook_event_name: z.string().optional(),
  })
  .refine((v) => v.prompt !== undefined || v.user_prompt !== undefined, {
    message: 'Either `prompt` or `user_prompt` is required',
  });

export type PrePromptPayload = z.infer<typeof PrePromptPayloadSchema>;

export interface PrePromptOptions {
  db?: DB;
  dbPath?: string;
  cwd?: string;
  config?: Config;
  projectId?: string;
}

// Claude Code accepts either free text on stdout (injected as context) or
// a structured object under hookSpecificOutput. We use the structured form
// so clients can tell that the content came from the cache.
export interface PrePromptOutput {
  ok: boolean;
  hit: boolean;
  matchKind?: 'exact' | 'fuzzy';
  similarity?: number;
  reason?: 'no-hit' | 'fingerprint-mismatch' | 'cache-disabled';
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
}

const MAX_INJECTED_CHARS = 4000;

function clampContext(text: string): string {
  if (text.length <= MAX_INJECTED_CHARS) return text;
  return `${text.slice(0, MAX_INJECTED_CHARS)}\n… [truncated]`;
}

export async function runPrePrompt(
  payload: PrePromptPayload,
  opts: PrePromptOptions = {},
): Promise<PrePromptOutput> {
  const parsed = PrePromptPayloadSchema.parse(payload);
  const prompt = parsed.prompt ?? parsed.user_prompt ?? '';
  if (prompt.trim().length === 0) return { ok: true, hit: false, reason: 'no-hit' };

  const cwd = opts.cwd ?? parsed.cwd ?? process.cwd();
  const config = opts.config ?? loadConfig({ cwd });
  if (!config.cache.enabled) return { ok: true, hit: false, reason: 'cache-disabled' };

  const projectId = opts.projectId ?? parsed.project_id ?? resolveProjectId(cwd);
  const ownsDb = opts.db === undefined;
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = opts.db ?? openDb({ path: dbPath });

  try {
    const cache = new PromptCache(db);

    // Try exact match first — it's free.
    let hit: CacheEntry | null = cache.lookupByHash(hashPrompt(prompt));
    let matchKind: 'exact' | 'fuzzy' = 'exact';
    let similarity: number | undefined;

    // Fall back to fuzzy match when enabled and we have an embedder available.
    if (!hit && config.cache.fuzzy_match && config.retrieval.embeddings.enabled) {
      ensureEmbedderConfigured(config);
      if (isEmbedderReady()) {
        try {
          const embedder = await getEmbedder();
          const fuzzy = await cache.lookupFuzzy(prompt, embedder, config.cache.fuzzy_threshold);
          if (fuzzy) {
            hit = fuzzy.entry;
            matchKind = 'fuzzy';
            similarity = fuzzy.similarity;
          }
        } catch {
          // A failing embedder should never block Claude Code; fall through to miss.
        }
      }
    }

    if (!hit) return { ok: true, hit: false, reason: 'no-hit' };

    // Re-hash the files that were touched when this response was captured.
    // If any content has changed, the cached response is stale.
    const current = fingerprintFiles(hit.files_touched, { cwd }).fingerprint;
    if (current !== hit.context_fingerprint) {
      cache.invalidate(hit.id);
      return { ok: true, hit: false, reason: 'fingerprint-mismatch' };
    }

    cache.touch(hit.id);
    const header =
      matchKind === 'fuzzy' && similarity !== undefined
        ? `[somtum-cache: fuzzy match sim=${similarity.toFixed(3)}]`
        : `[somtum-cache]`;
    const context = clampContext(
      `${header} A previous response addressed a matching prompt:\n---\n${hit.response}\n---\nUse it if still applicable; otherwise answer fresh.`,
    );
    const out: PrePromptOutput = {
      ok: true,
      hit: true,
      matchKind,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    };
    if (similarity !== undefined) out.similarity = similarity;
    return out;
  } finally {
    if (ownsDb) db.close();
  }
}
