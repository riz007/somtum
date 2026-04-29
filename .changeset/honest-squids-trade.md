---
'somtum': minor
---

- Add `somtum serve` dashboard, fix hook timeout bug, migrate to h3 v2
  - New `somtum serve` command opens an interactive dashboard (memory browser, knowledge graph, analytics panel, full-text search with strategy selector)
  - Fix "agent appears stuck" bug: cap `post_session` hook at 90 s with a hard `Promise.race` timeout; set Anthropic SDK per-call timeout to 25 s (was 600 s default); run file summaries 3-at-a-time instead of serially
  - Migrate server internals from h3 v1 deprecated API (`createApp`/`createRouter`/`eventHandler`/`fromNodeMiddleware`) to h3 v2 (`new H3()`, `defineEventHandler`, `fromNodeHandler`, `toNodeHandler`) — eliminates all deprecation warnings
  - Add four new REST endpoints: `GET /api/stats/full` (kind breakdown, cache stats, retrieval usage, top files), `GET /api/search` (strategy-aware retrieval), `DELETE /api/memories/:id` (soft-delete), graph capped at 200 nodes / 500 edges to prevent browser hangs
