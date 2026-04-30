// Internal CLI entry that the init-installed hook command invokes:
//   somtum hook post_session
//   somtum hook pre_prompt
//
// Reads a JSON payload on stdin and dispatches to the named hook module.

import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
    const logPath = join(homedir(), '.somtum', 'hook.log');
    appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch {
    /* non-fatal */
  }
}

export async function hookCommand(name: string): Promise<number> {
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
        hookLog(`[post_session] ERROR: ${(err as Error).message}`);
        // Exit 0: hook failures must not break the user's Claude Code session.
        console.error(`[somtum] post_session failed: ${(err as Error).message}`);
      }
      return 0;
    }
    case 'pre_prompt': {
      try {
        const payload = PrePromptPayloadSchema.parse(parsed);
        const output = await raceTimeout(runPrePrompt(payload), timeoutMs, 'pre_prompt');
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
