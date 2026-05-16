# somtum

## 2.2.0

### Minor Changes

- Improve onboarding diagnostics and silent-failure detection (v2.2.0)

  **FIX-01 — Backend warning on `somtum init`**
  If neither `claude` CLI nor `ANTHROPIC_API_KEY` is available when `somtum init` runs, a prominent warning is now printed to stderr with exact fix commands. Previously the tool completed silently and users discovered the problem only after a zero-memory session.

  **FIX-02 — Shell profile detection on `somtum init`**
  If `ANTHROPIC_API_KEY` is set in the current terminal but not in `~/.zshrc`, `~/.bashrc`, or `~/.profile`, a targeted notice is printed explaining that the SessionEnd hook subprocess will not inherit the key.

  **FIX-03 — `somtum doctor` moved to Step 2 of Getting Started**
  Doctor now appears immediately after `somtum init` in the docs, before the first session. The surrounding copy explicitly tells users not to proceed until all checks pass.

  **FIX-04 — Two-path setup callout at the top of Getting Started**
  A "Before you begin" section now appears as the first content block on the Getting Started page, explaining both the Claude Code subscription path (no API key needed) and the direct API key path with equal weight.

  **FIX-05 — Auto-diagnostic after first zero-memory session**
  After the first session completes with zero memories, the next `somtum` command automatically surfaces the key doctor checks (`api_key`, `hooks_installed`) so users can self-heal without visiting the docs. Runs at most once per project. Opt out with `somtum config set diagnostics.first_session_check false`.

  **FIX-06 — Inline fix commands in `somtum doctor`**
  Every failing check now shows indented, copy-pasteable fix commands directly in the output. Affects `db_file`, `api_key`, `hooks_installed`, `breakeven_ratio`, and `stale_memories`.

  **FIX-07 — Wrong directory warning on `somtum init`**
  If no project root indicators (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `.git`) are found in the current directory, a soft warning is printed with the current path. On interactive terminals, init waits for Enter before continuing. Skip with `--yes` or `--force`.

  **FIX-10 — README quickstart improvement**
  Added a "Before you begin — pick your setup" block at the top of the README Quickstart section. Mirrors the Getting Started two-path callout so users who skip the docs still see the backend requirements before hitting a silent failure. Doctor also promoted to Step 3 in the README sequence.

  **New config key**: `diagnostics.first_session_check` (boolean, default `true`)
  **New CLI flag**: `somtum init --yes` — skip interactive prompts for scripted installs

## 2.1.0

### Minor Changes

- 3d1f0fa: **Breaking defaults — check before upgrading.**

  Several defaults changed in ways that affect existing installations silently. If you upgrade without reading this, your injection window will shrink and file-gating will turn on.

  ### What changed

  | Setting                            | Old default | New default | Impact                                                                          |
  | ---------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------- |
  | `file_gating.enabled`              | `false`     | `true`      | File reads are now intercepted and replaced with cached summaries by default    |
  | `file_gating.min_file_size_tokens` | `500`       | `300`       | More files are gated (smaller threshold)                                        |
  | `injection.k`                      | `5`         | `3`         | Fewer memories injected per prompt                                              |
  | `injection.max_chars`              | `3000`      | `1500`      | Smaller injection window                                                        |
  | `retrieval.strategy`               | `hybrid`    | `bm25`      | Hybrid required embeddings that are off by default — bm25 is the honest default |

  ### New features (non-breaking)
  - **`injection.show_budget`** (default: `true`) — Prepends a `[somtum] injected N/M memories (~X tokens)` line to every prompt so you can see exactly what is being injected.
  - **`injection.min_relevance_score`** (default: `0`) — Raise to a positive value (e.g. `1.0`) to filter out weakly-matched memories and reduce noise.
  - **Extractor retry is cheaper** — On schema-validation failure, retries now send only the bad output + error instead of the full transcript again. Halves the token cost of every failed extraction attempt.

  ### How to keep v1.x behaviour after upgrading

  Add these to `~/.somtum/config.json` (or `.somtum/config.json` in your project):

  ```json
  {
    "file_gating": { "enabled": false },
    "injection": { "k": 5, "max_chars": 3000 }
  }
  ```

  Run `somtum doctor` after upgrading to verify your config is valid.

## 1.5.1

### Patch Changes

- 598d461: Update GitHub Pages deployment workflow to build VitePress docs before deploying (`docs/.vitepress/dist/` is now the deploy artifact instead of raw `docs/`). Fix VitePress `base` to `/somtum/` for correct asset paths on GitHub Pages. Add docs link to README header.

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
