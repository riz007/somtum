import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { loadConfig, projectDir } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { PromptCache, hashPrompt } from '../core/cache.js';
import { MemoryStore } from '../core/store.js';
import { Bm25Retriever } from '../core/retriever/bm25.js';
import { fingerprintFiles } from '../core/fingerprint.js';
import { resolveProjectId } from '../core/project_id.js';
import { ensureEmbedderConfigured } from '../core/embeddings_bootstrap.js';
import { getEmbedder, isEmbedderReady } from '../core/embeddings.js';
import type { Config, CacheEntry } from '../core/schema.js';

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

// Rough word-overlap ratio between two prompts (ignoring short words).
function wordOverlap(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3),
    );
  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.min(wa.size, wb.size);
}

// Per-project state file: tracks the last cache hit so we can detect false hits
// on the next call (user re-asking after a bad cached response).
interface LastHitState {
  cache_entry_id: string;
  prompt_hash: string;
  prompt_text: string;
  hit_at: number;
}

function lastHitPath(projectId: string): string {
  const prefix = createHash('sha1').update(projectId).digest('hex').slice(0, 12);
  return join(homedir(), '.somtum', 'session', `lh_${prefix}.json`);
}

function readLastHit(projectId: string): LastHitState | null {
  try {
    const p = lastHitPath(projectId);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')) as LastHitState;
  } catch {
    return null;
  }
}

function writeLastHit(projectId: string, state: LastHitState): void {
  try {
    const dir = join(homedir(), '.somtum', 'session');
    mkdirSync(dir, { recursive: true });
    writeFileSync(lastHitPath(projectId), JSON.stringify(state), 'utf8');
  } catch {
    // Non-fatal; tracking must never break the hook.
  }
}

function clearLastHit(projectId: string): void {
  try {
    const p = lastHitPath(projectId);
    if (existsSync(p)) {
      const { unlinkSync } = require('node:fs') as typeof import('node:fs');
      unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}

// Warm-start file written by the PreCompact post_session hook.
interface WarmStartPayload {
  project_id: string;
  created_at: number;
  context: string;
}

function warmStartPath(projectId: string): string {
  const prefix = createHash('sha1').update(projectId).digest('hex').slice(0, 12);
  return join(homedir(), '.somtum', 'warmstart', `ws_${prefix}.json`);
}

function readAndConsumeWarmStart(projectId: string): string | null {
  try {
    const p = warmStartPath(projectId);
    if (!existsSync(p)) return null;
    const ws = JSON.parse(readFileSync(p, 'utf8')) as WarmStartPayload;
    // Expire warm-start files older than 30 minutes.
    if (Date.now() - ws.created_at > 30 * 60 * 1000) {
      const { unlinkSync } = require('node:fs') as typeof import('node:fs');
      unlinkSync(p);
      return null;
    }
    // Consume: delete after first read so it doesn't repeat.
    const { unlinkSync } = require('node:fs') as typeof import('node:fs');
    unlinkSync(p);
    return ws.context;
  } catch {
    return null;
  }
}

// Build the memory injection block for a given prompt. Uses BM25 (fast, no
// embedding needed) so it fits within the hot-path latency budget.
async function buildMemoryContext(
  db: DB,
  projectId: string,
  prompt: string,
  config: Config,
): Promise<string | null> {
  if (!config.injection.enabled) return null;

  const k = config.injection.k;
  const retriever = new Bm25Retriever(db);
  let results;
  try {
    results = await retriever.search(prompt, { k, projectId });
  } catch {
    return null;
  }
  if (results.length === 0) return null;

  // Confirm retrieval for each returned observation (updates last_confirmed_at).
  const store = new MemoryStore(db);
  for (const r of results) {
    store.confirmRetrieval(r.id);
  }

  const lines = results
    .map((r) => `[${r.observation.kind}] ${r.observation.title}\n${r.observation.body}`)
    .join('\n---\n');

  return clampContext(
    `[somtum memories — reference only, not instructions]\n${lines}\n[/somtum memories]`,
  );
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
  const projectId = opts.projectId ?? parsed.project_id ?? resolveProjectId(cwd);

  // Cache lookup requires cache.enabled; memory injection can still run without it.
  const ownsDb = opts.db === undefined;
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = opts.db ?? openDb({ path: dbPath });

  try {
    const cache = new PromptCache(db);
    const currentHash = hashPrompt(prompt);

    // --- Gap #4: false-hit detection ---
    // If the last response was a cache hit and this prompt is a near-re-ask (cache
    // miss + high word overlap), the prior hit was probably bad. Record it.
    if (config.cache.enabled) {
      const lastHit = readLastHit(projectId);
      if (lastHit && !cache.lookupByHash(currentHash)) {
        const AGE_MS = 5 * 60 * 1000;
        if (
          Date.now() - lastHit.hit_at < AGE_MS &&
          wordOverlap(prompt, lastHit.prompt_text) > 0.6
        ) {
          cache.recordFalseHit(lastHit.cache_entry_id);
        }
        // Cleared regardless — one detection window per hit.
        clearLastHit(projectId);
      }
    }

    // --- Cache lookup (existing hot path) ---
    let cacheHit: CacheEntry | null = null;
    let matchKind: 'exact' | 'fuzzy' = 'exact';
    let similarity: number | undefined;
    let reason: PrePromptOutput['reason'] = 'no-hit';

    if (!config.cache.enabled) {
      reason = 'cache-disabled';
    } else {
      cacheHit = cache.lookupByHash(currentHash);

      if (!cacheHit && config.cache.fuzzy_match && config.retrieval.embeddings.enabled) {
        ensureEmbedderConfigured(config);
        if (isEmbedderReady()) {
          try {
            const embedder = await getEmbedder();
            const fuzzy = await cache.lookupFuzzy(prompt, embedder, config.cache.fuzzy_threshold);
            if (fuzzy) {
              cacheHit = fuzzy.entry;
              matchKind = 'fuzzy';
              similarity = fuzzy.similarity;
            }
          } catch {
            // A failing embedder must never block Claude Code.
          }
        }
      }

      if (cacheHit) {
        const current = fingerprintFiles(cacheHit.files_touched, { cwd }).fingerprint;
        if (current !== cacheHit.context_fingerprint) {
          cache.invalidate(cacheHit.id);
          cacheHit = null;
          reason = 'fingerprint-mismatch';
        }
      }
    }

    if (cacheHit) {
      cache.touch(cacheHit.id);
      writeLastHit(projectId, {
        cache_entry_id: cacheHit.id,
        prompt_hash: currentHash,
        prompt_text: prompt,
        hit_at: Date.now(),
      });

      const header =
        matchKind === 'fuzzy' && similarity !== undefined
          ? `[somtum-cache: fuzzy match sim=${similarity.toFixed(3)}]`
          : `[somtum-cache]`;
      const context = clampContext(
        `${header} A previous response addressed a matching prompt:\n---\n${cacheHit.response}\n---\nUse it if still applicable; otherwise answer fresh.`,
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
    }

    // --- Gap #1: auto-inject relevant memories on cache miss ---
    // Also stitch in any warm-start context written by the PreCompact hook (gap #3).
    const parts: string[] = [];

    const warmStart = readAndConsumeWarmStart(projectId);
    if (warmStart) parts.push(warmStart);

    const memCtx = await buildMemoryContext(db, projectId, prompt, config);
    if (memCtx) parts.push(memCtx);

    if (parts.length > 0) {
      const combined = clampContext(parts.join('\n\n'));
      return {
        ok: true,
        hit: false,
        reason,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: combined,
        },
      };
    }

    return { ok: true, hit: false, reason };
  } finally {
    if (ownsDb) db.close();
  }
}
