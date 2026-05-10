# somtum

## 1.5.0

### Minor Changes

- e2b0d42: Auto-inject memories on every prompt, `update` MCP tool, warm-start after PreCompact, false-hit detection, workspace observation scope, `suggest-claude-md` CLI command, and stale memory detection in `doctor`.
- 2122776: - **`somtum list`** — New command: lists stored memories for the current project with `--kind`, `--limit`, and `--json` filters. The fastest way to browse what Somtum has captured.
  - **`somtum reset`** — New command: permanently wipes the project DB and associated session/warm-start files. Prompts for confirmation; `--yes` skips it. Essential for debugging and starting fresh on a project.
  - **`somtum forget --all`** — New flag on the existing `forget` command: soft-deletes every active observation in the current project in one shot (recoverable via `export --include-deleted`).
  - **Embeddings timeout safety** — The fuzzy-match embedder path in `UserPromptSubmit` is now wrapped in a 2-second `Promise.race`. If the embedding model is slow to initialize (e.g. first download), it falls back to BM25 rather than hanging the hook.
  - **Config crash-resilience** — `loadConfig()` now catches malformed JSON and invalid config values, silently falling back to defaults instead of crashing the hook process. Run `somtum doctor` to surface config errors explicitly.
  - **`injection.max_chars` wired up** — The `injection.max_chars` config key (default `3000`) now actually controls the memory injection character cap. Previously the cap was hardcoded at `4000` regardless of the config.
  - **Warm-start race fix** — Warm-start files now use a `ws_<id>_<timestamp>.json` naming scheme so two Claude Code windows open on the same project no longer clobber each other's post-compaction context.
  - **Auth-error hint in hook log** — When `post_session` fails with a 401/403 or auth-related error, the hook now prints a specific hint (`check that ANTHROPIC_API_KEY is set and valid`) to stderr instead of a generic error message.

### Patch Changes

- Add multi-page VitePress documentation site under `docs/` covering getting started, how it works, CLI reference, configuration, MCP server, storage layout, dashboard, privacy & performance, troubleshooting, and contributing. Adds `docs:dev`, `docs:build`, and `docs:preview` scripts.

## 1.4.0

### Minor Changes

- **`somtum list`** — New command: lists stored memories for the current project with `--kind`, `--limit`, and `--json` filters. The fastest way to browse what Somtum has captured.

- **`somtum reset`** — New command: permanently wipes the project DB and associated session/warm-start files. Prompts for confirmation; `--yes` skips it. Essential for debugging and starting fresh on a project.

- **`somtum forget --all`** — New flag on the existing `forget` command: soft-deletes every active observation in the current project in one shot (recoverable via `export --include-deleted`).

- **Embeddings timeout safety** — The fuzzy-match embedder path in `UserPromptSubmit` is now wrapped in a 2-second `Promise.race`. If the embedding model is slow to initialize (e.g. first download), it falls back to BM25 rather than hanging the hook.

- **Config crash-resilience** — `loadConfig()` now catches malformed JSON and invalid config values, silently falling back to defaults instead of crashing the hook process. Run `somtum doctor` to surface config errors explicitly.

- **`injection.max_chars` wired up** — The `injection.max_chars` config key (default `3000`) now actually controls the memory injection character cap. Previously the cap was hardcoded at `4000` regardless of the config.

- **Warm-start race fix** — Warm-start files now use a `ws_<id>_<timestamp>.json` naming scheme so two Claude Code windows open on the same project no longer clobber each other's post-compaction context.

- **Auth-error hint in hook log** — When `post_session` fails with a 401/403 or auth-related error, the hook now prints a specific hint (`check that ANTHROPIC_API_KEY is set and valid`) to stderr instead of a generic error message.

## 1.3.0

### Minor Changes

- **Auto-inject memories on every prompt** — The `UserPromptSubmit` hook now runs a BM25 recall (top-k, < 2 ms) and injects relevant memories as `additionalContext` on every prompt, not just on cache hits. Memories surface automatically without requiring the agent to call `recall`. Configurable via `injection.enabled`, `injection.k`, `injection.max_chars`.

- **`update` MCP tool** — New tool to update an existing observation's `title`, `body`, `tags`, or `files` via MCP. Redaction is applied before storage. Agents can now correct bad captures without leaving the session.

- **Warm-start after `PreCompact`** — When Claude Code compacts a conversation, the `PostCompact` hook now writes a warm-start file (`~/.somtum/warmstart/ws_<id>.json`) containing the top-8 BM25 memories. The next `UserPromptSubmit` reads and consumes it (30-minute TTL), restoring context into the fresh conversation automatically.

- **False-hit detection** — Two mechanisms for populating `false_hit_count` on cache entries: (a) automatic — if the next prompt after a cache hit is a near-re-ask (≤ 5 min, > 60% word overlap) but a cache miss, the prior hit is flagged; (b) explicit — new `report_false_hit(cache_entry_id)` MCP tool for agent-driven feedback. Data feeds future fuzzy-threshold tuning.

- **Workspace / cross-project observation scope** — New `scope: 'project' | 'workspace' | 'global'` field on all observations (migration 004). The `remember` MCP tool accepts `scope`; `recall` and `get` return it. Workspace-scoped observations represent cross-project knowledge (team conventions, tool preferences).

- **`somtum suggest-claude-md`** — New CLI command: groups observations by kind, previews proposed CLAUDE.md additions, and asks for interactive confirmation before writing. Supports `--dry-run`, `--yes`, `--limit`. Off by default — must be explicitly invoked.

- **Stale memory detection in `somtum doctor`** — Adds a `stale_memories` check: warns when observations are older than 90 days with no confirmed retrievals (`last_confirmed_at IS NULL`). New `last_confirmed_at` column (migration 004) is bumped by `recall` and `get` on every hit. New `countStale()` and `listStale()` methods on `MemoryStore`.

## 1.2.0

### Minor Changes

- 131cefb: - Add `somtum serve` dashboard, fix hook timeout bug, migrate to h3 v2
  - New `somtum serve` command opens an interactive dashboard (memory browser, knowledge graph, analytics panel, full-text search with strategy selector)
  - Fix "agent appears stuck" bug: cap `post_session` hook at 90 s with a hard `Promise.race` timeout; set Anthropic SDK per-call timeout to 25 s (was 600 s default); run file summaries 3-at-a-time instead of serially
  - Migrate server internals from h3 v1 deprecated API (`createApp`/`createRouter`/`eventHandler`/`fromNodeMiddleware`) to h3 v2 (`new H3()`, `defineEventHandler`, `fromNodeHandler`, `toNodeHandler`) — eliminates all deprecation warnings
  - Add four new REST endpoints: `GET /api/stats/full` (kind breakdown, cache stats, retrieval usage, top files), `GET /api/search` (strategy-aware retrieval), `DELETE /api/memories/:id` (soft-delete), graph capped at 200 nodes / 500 edges to prevent browser hangs

## 1.1.0

### Minor Changes

- Add `somtum serve` dashboard, fix hook timeout bug, migrate to h3 v2
  - New `somtum serve` command opens an interactive dashboard (memory browser, knowledge graph, analytics panel, full-text search with strategy selector)
  - Fix "agent appears stuck" bug: cap `post_session` hook at 90 s with a hard `Promise.race` timeout; set Anthropic SDK per-call timeout to 25 s (was 600 s default); run file summaries 3-at-a-time instead of serially
  - Migrate server internals from h3 v1 deprecated API (`createApp`/`createRouter`/`eventHandler`/`fromNodeMiddleware`) to h3 v2 (`new H3()`, `defineEventHandler`, `fromNodeHandler`, `toNodeHandler`) — eliminates all deprecation warnings
  - Add four new REST endpoints: `GET /api/stats/full` (kind breakdown, cache stats, retrieval usage, top files), `GET /api/search` (strategy-aware retrieval), `DELETE /api/memories/:id` (soft-delete), graph capped at 200 nodes / 500 edges to prevent browser hangs

## 1.0.0

### Major Changes

- Robust multi-device sync, automated re-indexing, enhanced diagnostics, and official v1.0.0 branding.

  This release marks the transition of Somtum from an experimental tool to a production-ready, community-driven memory layer for Claude Code.
  - **License Migration:** Officially moved to the **MIT License** to encourage open-source contributions and ecosystem integration.
  - **Robust Sync:** Implemented hostname-aware syncing to prevent data loss across multiple devices.
  - **Auto-indexing:** New memories are now automatically embedded for semantic search immediately after capture.
  - **Vibrant Branding:** Introduced a Thai-style colored ASCII CLI logo and a completely redesigned, flavorful landing page.
  - **Doctor Fixes:** Corrected migration checks and added comprehensive system health diagnostics.
  - **Testing:** Significant increase in CLI test coverage to ensure long-term stability.

## 0.1.3

### Patch Changes

- 3b7dfbd: added keywords
- cf6d5a1: Add github pages and contributing guideline

## 0.1.2

### Patch Changes

- 01bd442: Initial release test.

## 0.1.1

### Patch Changes

- 9d07005: Project structure with updated README.md
