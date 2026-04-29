// Internal CLI entry that the init-installed hook command invokes:
//   somtum hook post_session
//   somtum hook pre_prompt
//
// Reads a JSON payload on stdin and dispatches to the named hook module.

import { readToEnd, runPostSession, HookPayloadSchema } from '../hooks/post_session.js';
import { runPrePrompt, PrePromptPayloadSchema } from '../hooks/pre_prompt.js';
import { runPreRead, PreReadPayloadSchema } from '../hooks/pre_read.js';

// Maximum wall-clock time each hook is allowed before we abort and exit.
// Claude Code sessions must not hang because a hook is stuck on a slow API
// call, a failed embedding-model download, or an unreachable network.
const HOOK_TIMEOUTS_MS: Record<string, number> = {
  post_session: 90_000, // extract + embed + file summaries — generous but bounded
  pre_prompt: 5_000, // hot path: only SQLite lookups in the common case
  pre_read: 1_000, // synchronous; 1 s is already very generous
};

function raceTimeout<T>(p: Promise<T>, ms: number, _label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      // Unref so the timer doesn't keep the process alive after natural exit.
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
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
      try {
        const payload = HookPayloadSchema.parse(parsed);
        const r = await raceTimeout(runPostSession(payload), timeoutMs, 'post_session');
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
        // Exit 0: hook failures must never break the user's Claude Code session.
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
