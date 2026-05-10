---
"somtum": major
---

**Breaking defaults — check before upgrading.**

Several defaults changed in ways that affect existing installations silently. If you upgrade without reading this, your injection window will shrink and file-gating will turn on.

### What changed

| Setting | Old default | New default | Impact |
|---|---|---|---|
| `file_gating.enabled` | `false` | `true` | File reads are now intercepted and replaced with cached summaries by default |
| `file_gating.min_file_size_tokens` | `500` | `300` | More files are gated (smaller threshold) |
| `injection.k` | `5` | `3` | Fewer memories injected per prompt |
| `injection.max_chars` | `3000` | `1500` | Smaller injection window |
| `retrieval.strategy` | `hybrid` | `bm25` | Hybrid required embeddings that are off by default — bm25 is the honest default |

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
