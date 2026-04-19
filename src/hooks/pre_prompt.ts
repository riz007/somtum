import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig, projectDir } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { resolveProjectId } from '../core/project_id.js';
import type { Config } from '../core/schema.js';

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

export function runPrePrompt(
  payload: PrePromptPayload,
  opts: PrePromptOptions = {},
): PrePromptOutput {
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
    const hit = cache.lookupByHash(hashPrompt(prompt));
    if (!hit) return { ok: true, hit: false, reason: 'no-hit' };

    // Re-hash the files that were touched when this response was captured.
    // If any content has changed, the cached response is stale.
    const current = fingerprintFiles(hit.files_touched, { cwd }).fingerprint;
    if (current !== hit.context_fingerprint) {
      cache.invalidate(hit.id);
      return { ok: true, hit: false, reason: 'fingerprint-mismatch' };
    }

    cache.touch(hit.id);
    const context = clampContext(
      `[somtum-cache] A previous response addressed a matching prompt:\n---\n${hit.response}\n---\nUse it if still applicable; otherwise answer fresh.`,
    );
    return {
      ok: true,
      hit: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    };
  } finally {
    if (ownsDb) db.close();
  }
}
