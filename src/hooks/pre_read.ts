import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { loadConfig, projectDir, GLOBAL_DIR } from '../config.js';
import { openDb, type DB } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import { FileFingerprintStore, statFile, matchesAnyGlob } from '../core/file_summary.js';
import { TokenLedger } from '../core/ledger.js';
import { countTokens } from '../core/tokens.js';
import type { Config } from '../core/schema.js';

// Claude Code's PreToolUse payload. Only whole-file Reads are gated.
export const PreReadPayloadSchema = z.object({
  tool_name: z.string().optional(),
  tool_input: z
    .object({
      file_path: z.string().optional(),
      notebook_path: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    })
    .passthrough()
    .optional(),
  cwd: z.string().optional(),
  project_id: z.string().optional(),
  session_id: z.string().optional(),
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

export interface PreReadOutput {
  ok: boolean;
  gated: boolean;
  reason?:
    | 'gating-disabled'
    | 'wrong-tool'
    | 'no-path'
    | 'targeted-read'
    | 'no-session'
    | 'file-missing'
    | 'excluded'
    | 'below-threshold'
    | 'no-summary'
    | 'stale-summary'
    | 'reread';
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
}

// The first whole-file Read of a summarized file in a session gets the
// summary instead of the file. A second Read of the same file goes through,
// so the agent can always get the real contents by asking again.
interface GateState {
  session_id: string;
  offered: string[];
  reread: string[];
}

function gateStatePath(projectId: string): string {
  const prefix = createHash('sha1').update(projectId).digest('hex').slice(0, 12);
  return join(GLOBAL_DIR, 'session', `gate_${prefix}.json`);
}

function readGateState(projectId: string, sessionId: string): GateState {
  try {
    const p = gateStatePath(projectId);
    if (existsSync(p)) {
      const s = JSON.parse(readFileSync(p, 'utf8')) as GateState;
      if (s.session_id === sessionId) return s;
    }
  } catch {
    /* fall through to a fresh state */
  }
  return { session_id: sessionId, offered: [], reread: [] };
}

function writeGateState(projectId: string, state: GateState): void {
  try {
    mkdirSync(join(GLOBAL_DIR, 'session'), { recursive: true });
    writeFileSync(gateStatePath(projectId), JSON.stringify(state), 'utf8');
  } catch {
    // Non-fatal; worst case the next Read is offered a summary again.
  }
}

function buildDenyReason(path: string, summary: string, tokens: number): string {
  return `[somtum] Summary of ${path} (~${tokens} tokens in full, unchanged since it was summarized):
---
${summary}
---
The full read was skipped to save tokens. If you need the exact contents (to edit the file, or for line-level detail), call Read on this file again and it will go through.`;
}

const pass = (reason: NonNullable<PreReadOutput['reason']>): PreReadOutput => ({
  ok: true,
  gated: false,
  reason,
});

export function runPreRead(payload: PreReadPayload, opts: PreReadOptions = {}): PreReadOutput {
  const parsed = PreReadPayloadSchema.parse(payload);
  const cwd = opts.cwd ?? parsed.cwd ?? process.cwd();
  const config = opts.config ?? loadConfig({ cwd });

  if (!config.file_gating.enabled) return pass('gating-disabled');
  if (parsed.tool_name !== 'Read') return pass('wrong-tool');
  const path = parsed.tool_input?.file_path;
  if (!path) return pass('no-path');
  if (parsed.tool_input?.offset !== undefined || parsed.tool_input?.limit !== undefined) {
    return pass('targeted-read');
  }
  // Without a session id there is no way to let a second Read through.
  const sessionId = parsed.session_id;
  if (!sessionId) return pass('no-session');
  if (matchesAnyGlob(path, config.file_gating.exclude_globs)) return pass('excluded');

  let stat: ReturnType<typeof statFile>;
  try {
    stat = statFile(path, { cwd });
  } catch {
    return pass('file-missing');
  }
  if (!stat) return pass('file-missing');
  if (stat.tokens < config.file_gating.min_file_size_tokens) return pass('below-threshold');

  const projectId = opts.projectId ?? parsed.project_id ?? resolveProjectId(cwd);
  const ownsDb = opts.db === undefined;
  const dbPath = opts.dbPath ?? join(projectDir(projectId), 'db.sqlite');
  const db = opts.db ?? openDb({ path: dbPath });

  try {
    const fp = new FileFingerprintStore(db).get(projectId, path);
    if (!fp || !fp.summary) return pass('no-summary');
    if (fp.content_hash !== stat.contentHash) return pass('stale-summary');

    const ledger = new TokenLedger(db);
    const key = isAbsolute(path) ? path : resolvePath(cwd, path);
    const state = readGateState(projectId, sessionId);

    if (state.offered.includes(key)) {
      if (!state.reread.includes(key)) {
        state.reread.push(key);
        writeGateState(projectId, state);
        ledger.record(projectId, 'file_gate_reread', stat.tokens, sessionId);
      }
      return pass('reread');
    }

    state.offered.push(key);
    writeGateState(projectId, state);
    ledger.record(projectId, 'file_gate_denied', stat.tokens, sessionId);
    ledger.record(projectId, 'file_gate_summary', countTokens(fp.summary), sessionId);

    return {
      ok: true,
      gated: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: buildDenyReason(path, fp.summary, stat.tokens),
      },
    };
  } finally {
    if (ownsDb) db.close();
  }
}
