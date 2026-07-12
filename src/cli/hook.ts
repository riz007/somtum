// Internal CLI entry that the init-installed hook command invokes:
//   somtum hook post_session
//   somtum hook pre_prompt
//
// Reads a JSON payload on stdin and dispatches to the named hook module.

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_DIR } from '../config.js';
import { readToEnd, runPostSession, HookPayloadSchema } from '../hooks/post_session.js';
import { runPrePrompt, PrePromptPayloadSchema } from '../hooks/pre_prompt.js';
import { runPreRead, PreReadPayloadSchema } from '../hooks/pre_read.js';

const HOOK_TIMEOUTS_MS: Record<string, number> = {
  post_session: 90_000,
  pre_prompt: 5_000,
  pre_read: 1_000,
};

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}

function hookLog(msg: string): void {
  try {
    const logPath = join(GLOBAL_DIR, 'hook.log');
    appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch {
    /* non-fatal */
  }
}

export async function hookCommand(name: string): Promise<number> {
  // Prevent re-entrant hook execution when somtum itself spawns `claude -p`
  // during extraction. Without this guard the child claude process fires
  // SessionEnd → somtum hook post_session again, causing a deadlock.
  if (process.env['SOMTUM_IN_HOOK']) {
    return 0;
  }

  const raw = await readToEnd(process.stdin);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[somtum] hook ${name}: invalid JSON on stdin: ${(err as Error).message}`);
    return 0;
  }

  const timeoutMs = HOOK_TIMEOUTS_MS[name] ?? 30_000;

  switch (name) {
    case 'post_session': {
      if (!process.env['ANTHROPIC_API_KEY']) {
        hookLog('[post_session] WARN: ANTHROPIC_API_KEY not set — extraction will fail');
      }
      try {
        const payload = HookPayloadSchema.parse(parsed);
        const r = await raceTimeout(runPostSession(payload), timeoutMs, 'post_session');
        hookLog(`[post_session] ok — inserted=${r.inserted} cache=${r.cacheEntriesAdded}`);
        console.log(
          JSON.stringify({
            ok: true,
            inserted: r.inserted,
            cache_entries_added: r.cacheEntriesAdded,
            summaries_generated: r.summariesGenerated,
            tokens_spent_estimated: r.tokensSpent,
            tokens_saved_total_estimated: r.tokensSavedTotal,
          }),
        );
      } catch (err) {
        const msg = (err as Error).message;
        hookLog(`[post_session] ERROR: ${msg}`);
        // Exit 0: hook failures must not break the user's Claude Code session.
        if (/401|403|authentication|api.?key/i.test(msg)) {
          console.error(
            `[somtum] post_session failed: ${msg}\n  Hint: check that ANTHROPIC_API_KEY is set and valid.`,
          );
        } else {
          console.error(`[somtum] post_session failed: ${msg}`);
        }
      }
      return 0;
    }
    case 'pre_prompt': {
      try {
        const payload = PrePromptPayloadSchema.parse(parsed);
        const output = await raceTimeout(runPrePrompt(payload), timeoutMs, 'pre_prompt');
        if (output.hookSpecificOutput && !output.hit) {
          hookLog('[pre_prompt] injected memories into context');
        } else if (output.hit) {
          hookLog(`[pre_prompt] cache hit kind=${output.matchKind ?? 'exact'}`);
        }
        console.log(JSON.stringify(output));
      } catch (err) {
        console.error(`[somtum] pre_prompt failed: ${(err as Error).message}`);
      }
      return 0;
    }
    case 'pre_read': {
      try {
        const payload = PreReadPayloadSchema.parse(parsed);
        const output = runPreRead(payload);
        console.log(JSON.stringify(output));
      } catch (err) {
        console.error(`[somtum] pre_read failed: ${(err as Error).message}`);
      }
      return 0;
    }
    default:
      console.error(`[somtum] unknown hook: ${name}`);
      return 0;
  }
}
