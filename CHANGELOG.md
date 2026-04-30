# somtum

## 1.3.0

### Minor Changes

- 867c695: `ANTHROPIC_API_KEY` is now optional. When not set, the `SessionEnd` hook falls back to `claude --print` (the Claude Code CLI) so Claude Code subscribers need no separate API key. The `api_key` doctor check now passes when either the key or the CLI is available, and `claudeCodeCaller()` is exported from the public API.

## 1.2.1

### Patch Changes

- afd256b: - Redesigned `somtum serve` dashboard UI (light/dark theme support, improved layout)
  - `somtum stats` now shows a setup hint when no memories have been captured yet, distinguishing between a missing `ANTHROPIC_API_KEY` and a hook that has not fired yet
  - `somtum doctor` gains a new `api_key` check that reports whether `ANTHROPIC_API_KEY` is set
  - Hook runner logs activity to `~/.somtum/hook.log` and emits a warning when `ANTHROPIC_API_KEY` is missing before the `post_session` extraction runs
  - `somtum serve` port option now accepts `-p` shorthand and defaults gracefully when omitted

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
