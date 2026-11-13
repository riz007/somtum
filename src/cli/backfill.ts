import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadConfig, projectDir } from '../config.js';
import { openDb } from '../core/db.js';
import { resolveProjectId } from '../core/project_id.js';
import { pickBackend, NO_BACKEND_MESSAGE } from '../core/llm_backend.js';
import { extractionOverheadTokens } from '../core/extractor.js';
import { captureGit } from '../core/git_context.js';
import { findPastSessions, type PastSession } from '../core/session_discovery.js';
import { planExtraction, readTranscript, runPostSession } from '../hooks/post_session.js';
import { AGENT_IDS, type AgentId } from '../agents/index.js';
import type { Config } from '../core/schema.js';

// Reading and parsing a transcript this large takes long enough to look hung,
// and extraction only keeps its last 60k tokens anyway.
const MAX_TRANSCRIPT_BYTES = 100 * 1024 * 1024;

export interface BackfillCandidate {
  session: PastSession;
  tokens: number;
  skip: 'too-large' | 'already-extracted' | null;
}

export function planBackfill(opts: {
  cwd: string;
  config: Config;
  limit: number;
  agents: readonly AgentId[];
  dbPath?: string;
}): BackfillCandidate[] {
  const projectId = resolveProjectId(opts.cwd);
  const db = openDb({ path: opts.dbPath ?? join(projectDir(projectId), 'db.sqlite') });
  try {
    return findPastSessions(opts.cwd, opts.agents)
      .slice(0, opts.limit)
      .map((session) => {
        if (session.bytes > MAX_TRANSCRIPT_BYTES) return { session, tokens: 0, skip: 'too-large' };
        const plan = planExtraction(
          db,
          session.sessionId,
          readTranscript(readFileSync(session.path, 'utf8')),
        );
        const enough = plan.tokens > 0 && plan.tokens >= opts.config.extraction.min_new_tokens;
        return { session, tokens: plan.tokens, skip: enough ? null : 'already-extracted' };
      });
  } finally {
    db.close();
  }
}

const n = (v: number): string => v.toLocaleString('en-US');

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

export async function backfillCommand(
  options: { cwd?: string; limit?: number; agent?: string; yes?: boolean; dryRun?: boolean } = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const agents: readonly AgentId[] =
    !options.agent || options.agent === 'all'
      ? AGENT_IDS
      : AGENT_IDS.filter((a) => a === options.agent);
  if (agents.length === 0) {
    console.error(`somtum: unknown agent "${options.agent}" (expected: claude-code, codex, all)`);
    return 1;
  }
  const backend = pickBackend(config);
  if (!backend) {
    console.error(`somtum: ${NO_BACKEND_MESSAGE}`);
    return 1;
  }

  const candidates = planBackfill({ cwd, config, limit: options.limit ?? 5, agents });
  if (candidates.length === 0) {
    console.log('No past Claude Code or Codex sessions found for this directory.');
    console.log('Run this from the directory you launch your agent in.');
    return 0;
  }

  // Oldest first, so where two sessions decided the same thing the later one wins.
  const todo = candidates
    .filter((c) => c.skip === null)
    .sort((a, b) => a.session.mtime - b.session.mtime);
  const overhead = extractionOverheadTokens(config.extraction.max_observations_per_session);
  console.log(
    `Found ${candidates.length} recent session${candidates.length === 1 ? '' : 's'} for this project:`,
  );
  for (const c of candidates) {
    const date = new Date(c.session.mtime).toISOString().slice(0, 10);
    const note =
      c.skip === 'too-large'
        ? 'skipped: over 100 MB'
        : c.skip === 'already-extracted'
          ? 'skipped: nothing new to extract'
          : `~${n(c.tokens + overhead)} tokens`;
    console.log(
      `  ${date}  ${c.session.agent.padEnd(11)}  ${c.session.sessionId.slice(0, 8)}  ${(c.session.branch ?? '-').padEnd(24)}  ${note}`,
    );
  }
  if (todo.length === 0) {
    console.log('\nNothing to extract.');
    return 0;
  }

  const total = todo.reduce((sum, c) => sum + c.tokens + overhead, 0);
  console.log(
    `\nExtracting ${todo.length} session${todo.length === 1 ? '' : 's'} sends ~${n(total)} tokens to ${backend}, plus roughly 1,000 output tokens each.`,
  );
  if (options.dryRun) return 0;
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.log('Re-run with --yes to proceed.');
      return 0;
    }
    if (!(await confirm('Continue? [y/N] '))) {
      console.log('Aborted.');
      return 0;
    }
  }

  // Summaries describe files as they are now, not as the past session saw
  // them, and their cost isn't in the estimate above.
  const runConfig: Config = { ...config, file_gating: { ...config.file_gating, enabled: false } };
  const defaultBranch = captureGit(cwd).defaultBranch;
  let inserted = 0;
  let spent = 0;
  for (const [i, c] of todo.entries()) {
    const label = `[${i + 1}/${todo.length}] ${c.session.sessionId.slice(0, 8)}`;
    try {
      const r = await runPostSession(
        {
          transcript_path: c.session.path,
          session_id: c.session.sessionId,
          cwd,
          hook_event_name: 'Backfill',
        },
        {
          cwd,
          config: runConfig,
          capturedAt: c.session.mtime,
          git: {
            branch: c.session.branch,
            commit: c.session.commit,
            defaultBranch,
            beforeFirstCommit: false,
          },
        },
      );
      inserted += r.inserted;
      spent += r.tokensSpent;
      console.log(`${label}  ${r.inserted} memories  (${n(r.tokensSpent)} tokens)`);
    } catch (err) {
      console.error(`${label}  failed: ${(err as Error).message}`);
    }
  }
  console.log(
    `\nDone: ${inserted} memories from ${todo.length} sessions, ${n(spent)} tokens. See them with: somtum list`,
  );
  return 0;
}
