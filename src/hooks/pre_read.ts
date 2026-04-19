import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig, projectDir } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import { FileFingerprintStore, statFile, matchesAnyGlob } from '../core/file_summary.js';
import type { Config } from '../core/schema.js';

// Claude Code's PreToolUse payload. We only care about file_path-bearing
// tools (Read, Edit). Anything else passes through.
export const PreReadPayloadSchema = z.object({
  tool_name: z.string().optional(),
  tool_input: z
    .object({
      file_path: z.string().optional(),
      notebook_path: z.string().optional(),
    })
    .passthrough()
    .optional(),
  cwd: z.string().optional(),
  project_id: z.string().optional(),
  hook_event_name: z.string().optional(),
});

export type PreReadPayload = z.infer<typeof PreReadPayloadSchema>;

export interface PreReadOptions {
  db?: DB;
  dbPath?: string;
  cwd?: string;
  config?: Config;
  projectId?: string;
}

// PreToolUse output. Matches Claude Code's hookSpecificOutput contract for
// PreToolUse. We never return "deny" — the agent can always still read; we
// only inject the summary as additional context so it can decide whether
// the full read is necessary.
export interface PreReadOutput {
  ok: boolean;
  gated: boolean;
  reason?:
    | 'gating-disabled'
    | 'wrong-tool'
    | 'no-path'
    | 'file-missing'
    | 'excluded'
    | 'below-threshold'
    | 'no-summary'
    | 'stale-summary';
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    additionalContext: string;
  };
}

const GATEABLE_TOOLS = new Set(['Read', 'Edit']);

function buildContextMessage(path: string, summary: string, tokens: number): string {
  return `[somtum-cache] Cached summary of ${path} (~${tokens} tokens in full):
---
${summary}
---
This summary is fresh as of the current file content. Use it if it answers the question; otherwise still proceed with the Read.`;
}

export function runPreRead(payload: PreReadPayload, opts: PreReadOptions = {}): PreReadOutput {
  const parsed = PreReadPayloadSchema.parse(payload);
  const cwd = opts.cwd ?? parsed.cwd ?? process.cwd();
  const config = opts.config ?? loadConfig({ cwd });

  if (!config.file_gating.enabled) return { ok: true, gated: false, reason: 'gating-disabled' };
  if (!parsed.tool_name || !GATEABLE_TOOLS.has(parsed.tool_name)) {
    return { ok: true, gated: false, reason: 'wrong-tool' };
  }
  const path = parsed.tool_input?.file_path;
  if (!path) return { ok: true, gated: false, reason: 'no-path' };
  if (matchesAnyGlob(path, config.file_gating.exclude_globs)) {
    return { ok: true, gated: false, reason: 'excluded' };
  }

  const stat = statFile(path, { cwd });
  if (!stat) return { ok: true, gated: false, reason: 'file-missing' };
  if (stat.tokens < config.file_gating.min_file_size_tokens) {
    return { ok: true, gated: false, reason: 'below-threshold' };
  }

  const projectId = opts.projectId ?? parsed.project_id ?? resolveProjectId(cwd);
  const ownsDb = opts.db === undefined;
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = opts.db ?? openDb({ path: dbPath });

  try {
    const store = new FileFingerprintStore(db);
    const fp = store.get(projectId, path);

    if (!fp || !fp.summary) return { ok: true, gated: false, reason: 'no-summary' };
    if (fp.content_hash !== stat.contentHash) {
      return { ok: true, gated: false, reason: 'stale-summary' };
    }

    return {
      ok: true,
      gated: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: buildContextMessage(path, fp.summary, stat.tokens),
      },
    };
  } finally {
    if (ownsDb) db.close();
  }
}
