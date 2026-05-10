# Configuration

Global config lives at `~/.somtum/config.json`. Per-project config at `.somtum/config.json` overrides it (deep merge).

## Common settings

```bash
# Enable semantic (embedding-based) search — downloads a 30 MB model once
somtum config set retrieval.embeddings.enabled true
somtum reindex

# Switch to hybrid retrieval (BM25 + embeddings + rerank) for best recall
somtum config set retrieval.strategy hybrid

# Use LLM-based retrieval (no embeddings required, costs one Haiku call per query)
somtum config set retrieval.index.enabled true
somtum config set retrieval.strategy index

# Disable file-gating (on by default — intercepts large file reads and serves cached summary)
somtum config set file_gating.enabled false

# Limit observations extracted per session (default: 10)
somtum config set extraction.max_observations_per_session 5

# Control automatic memory injection on every prompt (default: on)
somtum config set injection.enabled false     # turn off auto-inject
somtum config set injection.k 5              # inject more memories (default: 3)
somtum config set injection.max_chars 3000   # raise injection size cap (default: 1500)
```

## Full config reference

```jsonc
{
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "trigger": ["SessionEnd", "PreCompact"],
    "max_observations_per_session": 10
  },
  "cache": {
    "enabled": true,
    "fuzzy_match": true,
    "fuzzy_threshold": 0.92,   // raise to 0.95 once you have false-hit signal
    "max_entries": 10000,
    "ttl_days": 90
  },
  "retrieval": {
    "strategy": "bm25",          // bm25 | embeddings | index | hybrid
    "k": 8,
    "rerank_model": "claude-haiku-4-5-20251001",
    "bm25": { "enabled": true },
    "embeddings": {
      "enabled": false,          // set true to download the 30 MB ONNX model
      "model": "Xenova/bge-small-en-v1.5"
    },
    "index": {
      "enabled": false,          // set true to use Haiku as the retriever
      "model": "claude-haiku-4-5-20251001"
    }
  },
  // Auto-inject: BM25-retrieved memories prepended to every UserPromptSubmit.
  // Uses the hot path (< 2 ms at 1k memories). Disable if you prefer pull-only.
  "injection": {
    "enabled": true,
    "k": 3,                   // max memories injected per prompt
    "max_chars": 1500,        // hard cap on injected text
    "min_relevance_score": 0, // raise (e.g. 1.0) to only inject high-scoring matches
    "show_budget": true       // prepend "[somtum] injected N/M memories (~X tokens)" line
  },
  "file_gating": {
    "enabled": true,          // intercepts large file reads; serves cached summary instead
    "min_file_size_tokens": 300,
    "exclude_globs": ["**/*.env", "**/secrets/**"]
  },
  "privacy": {
    "telemetry": false,
    "redact_patterns": [
      "api[_-]?key\\s*[:=]\\s*[\"']?[A-Za-z0-9_\\-]{8,}[\"']?",
      "bearer\\s+[A-Za-z0-9_\\-.]+",
      "sk-[A-Za-z0-9_\\-]{20,}",
      "xox[baprs]-[A-Za-z0-9-]{10,}",
      "AKIA[0-9A-Z]{16}"
    ]
  },
  "sync": {
    "enabled": false,
    "backend": "ssh",
    "remote": null    // e.g. "user@host:/home/user/.somtum/projects/<id>"
  }
}
```

## Retrieval strategy comparison

| Strategy | How it works | Best for | Cost |
| --- | --- | --- | --- |
| **`bm25`** | Keyword search (SQLite FTS5, no dependencies) | Exact terms, offline setups | Near-zero |
| **`embeddings`** | Semantic similarity, local 30 MB ONNX model | "What did we decide about auth?" | ~5 ms at 10k memories |
| **`index`** | Haiku picks relevant IDs from a compact catalog | Paraphrased or fuzzy queries | 1 Haiku API call |
| **`hybrid`** | BM25 + embeddings, re-ranked by Haiku | General case (best recall) | BM25 + embeddings + 1 Haiku call |

::: warning Hybrid requires embeddings
Setting `retrieval.strategy = "hybrid"` without enabling embeddings causes a silent fallback to BM25 while paying hybrid overhead. `somtum doctor` will surface this as `strategy=hybrid` / `embeddings: disabled`.

Always enable embeddings first when using hybrid:

```bash
somtum config set retrieval.embeddings.enabled true
somtum reindex   # downloads ~30 MB ONNX model once
somtum config set retrieval.strategy hybrid
```

If you don't have an `ANTHROPIC_API_KEY` or prefer offline operation, use `bm25` instead.
:::
