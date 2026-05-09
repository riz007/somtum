---
'somtum': minor
---

- **`somtum list`** — New command: lists stored memories for the current project with `--kind`, `--limit`, and `--json` filters. The fastest way to browse what Somtum has captured.

- **`somtum reset`** — New command: permanently wipes the project DB and associated session/warm-start files. Prompts for confirmation; `--yes` skips it. Essential for debugging and starting fresh on a project.

- **`somtum forget --all`** — New flag on the existing `forget` command: soft-deletes every active observation in the current project in one shot (recoverable via `export --include-deleted`).

- **Embeddings timeout safety** — The fuzzy-match embedder path in `UserPromptSubmit` is now wrapped in a 2-second `Promise.race`. If the embedding model is slow to initialize (e.g. first download), it falls back to BM25 rather than hanging the hook.

- **Config crash-resilience** — `loadConfig()` now catches malformed JSON and invalid config values, silently falling back to defaults instead of crashing the hook process. Run `somtum doctor` to surface config errors explicitly.

- **`injection.max_chars` wired up** — The `injection.max_chars` config key (default `3000`) now actually controls the memory injection character cap. Previously the cap was hardcoded at `4000` regardless of the config.

- **Warm-start race fix** — Warm-start files now use a `ws_<id>_<timestamp>.json` naming scheme so two Claude Code windows open on the same project no longer clobber each other's post-compaction context.

- **Auth-error hint in hook log** — When `post_session` fails with a 401/403 or auth-related error, the hook now prints a specific hint (`check that ANTHROPIC_API_KEY is set and valid`) to stderr instead of a generic error message.
