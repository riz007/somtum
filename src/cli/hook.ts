// Internal CLI entry that the init-installed hook command invokes:
//   somtum hook post_session
//   somtum hook pre_prompt
//
// Reads a JSON payload on stdin and dispatches to the named hook module.

import { readToEnd, runPostSession, HookPayloadSchema } from '../hooks/post_session.js';
import { runPrePrompt, PrePromptPayloadSchema } from '../hooks/pre_prompt.js';

export async function hookCommand(name: string): Promise<number> {
  const raw = await readToEnd(process.stdin);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[somtum] hook ${name}: invalid JSON on stdin: ${(err as Error).message}`);
    return 0;
  }

  switch (name) {
    case 'post_session': {
      try {
        const payload = HookPayloadSchema.parse(parsed);
        const r = await runPostSession(payload);
        console.log(
          JSON.stringify({
            ok: true,
            inserted: r.inserted,
            cache_entries_added: r.cacheEntriesAdded,
            tokens_spent_estimated: r.tokensSpent,
            tokens_saved_total_estimated: r.tokensSavedTotal,
          }),
        );
      } catch (err) {
        // Exit 0: hook failures must not break the user's Claude Code session.
        console.error(`[somtum] post_session failed: ${(err as Error).message}`);
      }
      return 0;
    }
    case 'pre_prompt': {
      try {
        const payload = PrePromptPayloadSchema.parse(parsed);
        const output = runPrePrompt(payload);
        console.log(JSON.stringify(output));
      } catch (err) {
        console.error(`[somtum] pre_prompt failed: ${(err as Error).message}`);
      }
      return 0;
    }
    default:
      console.error(`[somtum] unknown hook: ${name}`);
      return 0;
  }
}
