---
'somtum': minor
---

Fix transcript parsing against real Claude Code JSONL and tighten hook hygiene.

- **Transcript parsing (major fix):** Claude Code delivers tool results as user-role messages. Somtum previously treated them as real user prompts, which (a) truncated every cached response at the first tool call, (b) polluted the prompt cache with garbage `[tool_result …]` entries, and (c) fed tool output to the extractor as user speech. Tool-result messages are now classified as `tool` turns, `isMeta`/`isSidechain` lines are skipped, oversized tool results are truncated, and synthetic prompts (slash-command wrappers, interruption markers) are never used as cache keys.
- **Session-scoped injection dedup:** memories already injected earlier in the same session are no longer re-injected on every prompt (injected context persists in the session's context window). State resets on a new session or after compaction.
- **Cache retention enforced:** `cache.ttl_days` and `cache.max_entries` were config-only; the cache now prunes invalidated, expired, and least-recently-hit overflow entries at session end.
- **Migration race fixed:** two processes opening the same fresh DB concurrently could crash with `UNIQUE constraint failed: schema_migrations.version`; migrations now re-check under the write lock.
- **CLI fallback cost fix:** the `claude -p` extraction fallback now passes `--model`, so extraction runs on the configured Haiku model instead of the user's default (often Opus).
- **SOMTUM_HOME respected everywhere:** session state, warm-start files, `hook.log`, and the first-session flag previously hardcoded `~/.somtum`; they now honor `SOMTUM_HOME` (the first-session flag was written to a different path than it was read from when `SOMTUM_HOME` was set). Tests are also isolated from the developer's real `~/.somtum`.
