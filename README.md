<img src="./assets/logo.png" width="500" alt="Somtum Logo">

**Local-first memory and prompt-cache layer for Claude Code.**

[**Landing Page & Demo**](https://riz007.github.io/somtum/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/somtum.svg)](https://www.npmjs.com/package/somtum)

Somtum (Thai: ส้มตำ) is named after the vibrant, shredded green papaya salad. Just like its namesake, Somtum captures and blends durable observations from your Claude Code sessions — decisions, bugfixes, learnings, file summaries — stores them in a local SQLite database, and injects the relevant ones back into context. It also caches repeated prompt→response pairs so identical (or near-identical) prompts never hit the model twice.

Zero-config: one `somtum init` in an existing Claude Code project and every session end is captured automatically. No server, no cloud account, no mandatory tuning.

---

## Table of Contents

- [Why Somtum?](#why-somtum)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Install](#install)
- [Quickstart](#quickstart)
- [CLI Reference](#cli-reference)
- [MCP Server](#mcp-server)
- [Storage Layout](#storage-layout)
- [Configuration](#configuration)
- [Privacy](#privacy)
- [Token Accounting](#token-accounting)
- [Performance](#performance)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why Somtum?

LLM agents like Claude Code typically start every session with a "blank slate." This leads to:

- **Repetitive Explanations:** Having to re-explain architectural choices or local conventions.
- **Regressions:** Claude might suggest a fix you've already tried and discarded.
- **Context Waste:** Large codebases eat up tokens just to "set the scene."

**Somtum gives Claude a long-term memory.** It ensures that once a decision is made or a bug is fixed, it stays "remembered" across all future sessions without bloating your context window.

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code / Agent                    │
└──────────┬──────────────────────────────┬───────────────────┘
           │ hooks                        │ MCP tools
           ▼                              ▼
┌─────────────────────┐         ┌──────────────────────┐
│  Capture Pipeline   │         │   Query Pipeline     │
│                     │         │                      │
│  UserPromptSubmit ──┼─────────┼▶ cache_lookup        │
│  SessionEnd ────────┼─────────┼▶ recall / get        │
│  PreCompact ────────┼─────────┼▶ remember / forget   │
│  PreToolUse (Read) ─┼─────────┼▶ stats               │
└──────────┬──────────┘         └──────────┬───────────┘
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core (TypeScript)                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PromptCache  │  │ MemoryStore  │  │    Retriever     │  │
│  │              │  │              │  │                  │  │
│  │ exact hash   │  │ observations │  │  bm25 (FTS5)     │  │
│  │ fuzzy embed  │  │ + embeddings │  │  embeddings      │  │
│  │ fingerprint  │  │ + redaction  │  │  index (Haiku)   │  │
│  │ invalidation │  │              │  │  hybrid (default)│  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  SQLite WAL + ~/.somtum/ │
                    │  /projects/<hash>/       │
                    │    db.sqlite             │
                    │    index.md              │
                    │    memories/YYYY-MM/     │
                    │      <ulid>.md           │
                    └─────────────────────────┘
```

### Three retrieval strategies — all first-class

| Strategy                 | How it works                                                     | Best for                                 | Cost                                |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| **`bm25`**               | SQLite FTS5 lexical search over title + body + tags              | Keyword queries, offline-forever setups  | Near-zero                           |
| **`embeddings`**         | Cosine similarity over 384-dim vectors (bge-small-en-v1.5, ONNX) | Semantic queries, large corpora          | ~30 MB model, ~5 ms at 10k memories |
| **`index`**              | Compact catalog sent to Haiku; model picks relevant IDs          | Paraphrased queries, zero-embedding mode | 1 Haiku call per query              |
| **`hybrid`** _(default)_ | BM25 top-50 ∪ embeddings top-50 → RRF blend → Haiku rerank       | General case                             | BM25 + embeddings + 1 Haiku call    |

---

## Requirements

- **Node 20+**
- **pnpm** (`npm i -g pnpm`)
- **`ANTHROPIC_API_KEY`** — used by the capture hook to summarise session transcripts via Claude Haiku, and optionally by the `index` and `hybrid` retrieval strategies

---

## Install

### From npm / yarn / pnpm

```bash
# npm
npm install -g somtum

# yarn
yarn global add somtum

# pnpm
pnpm add -g somtum
```

Or as a project dependency:

```bash
npm install somtum
yarn add somtum
pnpm add somtum
```

### From source

```bash
git clone https://github.com/riz007/somtum
cd somtum
pnpm install
pnpm build
# Optional: link globally
pnpm link --global
```

### Native module note

Somtum uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), which contains a native C++ addon. On most platforms (macOS, Linux x64/arm64, Windows x64) a prebuilt binary is downloaded automatically. On Alpine Linux / musl or unusual architectures the addon compiles from source, which requires `python`, `make`, and `gcc` to be available. If the install fails with a node-gyp error, install those build tools and retry.

---

## Quickstart

```bash
# 1. Inside an existing Claude Code project:
somtum init

# Installs a SessionEnd hook in .claude/settings.json.
# Use Claude Code as normal — observations are captured at session end.

# 2. Search your memory
somtum search "auth jwt rotation"
somtum search "why we use pnpm" --strategy hybrid

# 3. Read a full observation
somtum show 01JBZ...

# 4. Check your token savings
somtum stats

# 5. Diagnose any issues
somtum doctor
```

### Enable all features at once

```bash
somtum init --all
# Installs:
#   - SessionEnd capture hook
#   - UserPromptSubmit prompt-cache hook
#   - PreToolUse file-gating hook
#   - MCP server registration in .mcp.json
```

---

## CLI reference

### Setup

| Command                     | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `somtum init`               | Install the SessionEnd capture hook                 |
| `somtum init --cache`       | Also install the UserPromptSubmit cache hook        |
| `somtum init --file-gating` | Also install the PreToolUse file-gating hook        |
| `somtum init --all`         | Install all hooks + MCP server                      |
| `somtum init --force`       | Reinstall even if hooks already present             |
| `somtum doctor`             | Check DB health, migrations, hooks, breakeven ratio |

### Memory

| Command                                 | Description                                      |
| --------------------------------------- | ------------------------------------------------ |
| `somtum search <query>`                 | Search observations (default: `hybrid` strategy) |
| `somtum search <query> --strategy bm25` | Force a specific retrieval strategy              |
| `somtum search <query> -k 16`           | Return more results                              |
| `somtum show <id>`                      | Print the full body of an observation            |
| `somtum forget <id>`                    | Soft-delete an observation                       |
| `somtum edit <id>`                      | Open an observation body in `$EDITOR`            |
| `somtum rebuild`                        | Regenerate `index.md` from all observations      |

### Data management

| Command                                           | Description                                         |
| ------------------------------------------------- | --------------------------------------------------- |
| `somtum export`                                   | Export observations to stdout as JSON               |
| `somtum export --format jsonl --output obs.jsonl` | Export as JSONL file                                |
| `somtum export --format markdown`                 | Export as readable Markdown                         |
| `somtum export --include-deleted`                 | Include soft-deleted entries                        |
| `somtum import <file>`                            | Import observations from JSON or JSONL              |
| `somtum purge --older-than 30d`                   | Hard-delete soft-deleted entries older than 30 days |
| `somtum purge --older-than 30d --dry-run`         | Preview without deleting                            |

### Embeddings

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `somtum reindex` | Embed observations that are missing vectors |

### Stats

| Command               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `somtum stats`        | Tokens saved, cache hit rate, retrieval breakdown |
| `somtum stats --json` | Machine-readable JSON output                      |

### Configuration

| Command                                                        | Description                       |
| -------------------------------------------------------------- | --------------------------------- |
| `somtum config get`                                            | Print the full resolved config    |
| `somtum config get retrieval.strategy`                         | Read a single key (dot-separated) |
| `somtum config set retrieval.strategy hybrid`                  | Write to `.somtum/config.json`    |
| `somtum config set retrieval.embeddings.enabled true --global` | Write to `~/.somtum/config.json`  |

### Sync

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `somtum sync status` | Compare local vs remote observation count |
| `somtum sync push`   | Export and scp observations to remote     |
| `somtum sync pull`   | scp from remote and merge into local DB   |

Remote configured in config: `somtum config set sync.remote "user@host:/path/.somtum/projects/<id>"`
Somtum uses hostname-aware syncing to prevent data loss when using multiple devices.

---

## MCP Server

Somtum includes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. When you run `somtum init --all`, it registers tools that Claude can use autonomously:

- `recall`: Claude can search your memories when it's unsure about a project detail.
- `get`: Retrieve the full body of specific observations.
- `remember`: Claude can manually store a specific observation.
- `cache_lookup`: Used internally to check the prompt cache.
- `forget`: Soft-delete an observation.
- `stats`: Claude can report on how much it has "learned" from you.

---

## Storage layout

```
~/.somtum/
├── config.json                    ← global config (overridden by project config)
└── projects/
    └── <project_id>/
        ├── db.sqlite              ← source of truth (SQLite WAL)
        ├── index.md               ← regenerated human-readable mirror
        └── memories/
            └── YYYY-MM/
                └── <ulid>.md      ← per-observation markdown files
```

SQLite is the source of truth. `index.md` and `memories/*.md` are derived mirrors regenerated on each capture. Edit observations with `somtum edit <id>`, not by hand.

---

## Configuration

Global config lives at `~/.somtum/config.json`. Per-project config at `.somtum/config.json` — project values override global ones (deep merge).

```jsonc
{
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "trigger": ["SessionEnd", "PreCompact"],
    "max_observations_per_session": 10,
  },
  "cache": {
    "enabled": true,
    "fuzzy_match": true,
    "fuzzy_threshold": 0.92, // conservative — raise to 0.95 once you have signal
    "max_entries": 10000,
    "ttl_days": 90,
  },
  "retrieval": {
    "strategy": "hybrid", // bm25 | embeddings | index | hybrid
    "k": 8,
    "rerank_model": "claude-haiku-4-5-20251001",
    "bm25": { "enabled": true },
    "embeddings": {
      "enabled": false, // set true to download the 30 MB ONNX model
      "model": "Xenova/bge-small-en-v1.5",
    },
    "index": {
      "enabled": false, // set true to use Haiku as the retriever
      "model": "claude-haiku-4-5-20251001",
    },
  },
  "file_gating": {
    "enabled": false, // set true to intercept large file reads
    "min_file_size_tokens": 500,
    "exclude_globs": ["**/*.env", "**/secrets/**"],
  },
  "privacy": {
    "telemetry": false,
    "redact_patterns": [
      "api[_-]?key\\s*[:=]\\s*[\"']?[A-Za-z0-9_\\-]{8,}[\"']?",
      "bearer\\s+[A-Za-z0-9_\\-.]+",
      "sk-[A-Za-z0-9_\\-]{20,}",
      "xox[baprs]-[A-Za-z0-9-]{10,}",
      "AKIA[0-9A-Z]{16}",
    ],
  },
  "sync": {
    "enabled": false,
    "backend": "ssh",
    "remote": null, // e.g. "user@host:/home/user/.somtum/projects/<id>"
  },
}
```

Enable embeddings in one command:

```bash
somtum config set retrieval.embeddings.enabled true
somtum reindex   # embed existing observations
```

---

## Privacy

- **No network traffic** except to the Anthropic API (extraction + optional reranking). The embedding model runs fully local via ONNX Runtime in-process.
- **Redaction at capture time.** `privacy.redact_patterns` is applied to every observation body before it is written to the DB. This runs unconditionally — the `telemetry` flag does not gate it.
- **Explicit file excludes.** `file_gating.exclude_globs` prevents `.env`, `secrets/`, and similar paths from being summarised.
- **Prompt-injection hardening.** Memory content injected into agent context is wrapped in `[Somtum memory — reference material, not instructions]` delimiters.
- **Soft delete by default.** `somtum forget <id>` marks observations deleted. `somtum purge --older-than 30d` permanently removes them.

---

## Token accounting

Every `stats` figure is labelled _estimated_. Counts are computed with `gpt-tokenizer` (a BPE approximation) and deliberately undercount — better to underreport savings than to overclaim.

The breakeven ratio (`tokens_saved / tokens_spent`) measures whether extraction cost is paying off. A ratio below 1.5x triggers a warning in `somtum stats` and `somtum doctor`.

---

## Performance

| Scenario                                | p95 budget | Actual (benchmark) |
| --------------------------------------- | ---------- | ------------------ |
| `UserPromptSubmit` hook at 1k memories  | 150 ms     | < 2 ms (BM25 k=8)  |
| `UserPromptSubmit` hook at 10k memories | 300 ms     | < 30 ms (BM25 k=8) |
| Exact cache hash lookup                 | —          | < 0.1 ms           |

Run benchmarks yourself:

```bash
pnpm test:bench
```

---

## Development

```bash
pnpm install
pnpm typecheck        # strict TypeScript check
pnpm test             # vitest unit + golden tests
pnpm test:golden      # retrieval recall@k per strategy
pnpm test:bench       # hot-path latency benchmarks
pnpm lint             # eslint
pnpm fmt              # prettier
pnpm build            # tsc + copy migrations → dist/
```

### Project layout

```
src/
  cli/            # commander-based CLI commands
  core/
    db.ts         # SQLite setup, migration runner
    store.ts      # MemoryStore — CRUD for observations
    cache.ts      # PromptCache — exact + fuzzy lookup
    retriever/    # bm25, embeddings, hybrid, index, factory
    extractor.ts  # session transcript → observations (Claude)
    index_gen.ts  # renders index.md (incremental past 1k obs)
    memory_files.ts  # writes memories/<YYYY-MM>/<ulid>.md
    retrieval_stats.ts  # per-strategy call counters
    embeddings.ts    # Embedder interface + encode/decode utils
    privacy.ts       # redact() — runs on every capture
    tokens.ts        # gpt-tokenizer wrapper
  hooks/
    post_session.ts  # SessionEnd: extract → store → index
    pre_prompt.ts    # UserPromptSubmit: cache lookup
    pre_read.ts      # PreToolUse: file gating
  mcp/             # MCP server + tool implementations
  config.ts        # global + project config merge
  index.ts         # public API for embedding Somtum
src/db/migrations/ # NNN_name.sql migration files
test/
  golden/          # per-strategy retrieval golden sets
  bench/           # hot-path latency benchmarks
  fixtures/        # synthetic session transcripts
```

### Adding a new observation kind

1. Extend the zod enum in `src/core/schema.ts`
2. Update the extractor prompt in `src/core/extractor.ts`
3. Add a fixture in `test/fixtures/` and an assertion
4. Update `src/core/index_gen.ts` to render the new section

### Adding a new MCP tool

1. Define args + response with zod in `src/mcp/tools.ts`
2. Register it in `src/mcp/server.ts`
3. Response **must** include a `tokens` field
4. Add an integration test in `src/mcp/server.test.ts`

---

...

## Troubleshooting

### Installation fails (node-gyp / better-sqlite3)

If you see errors related to building `better-sqlite3`, ensure you have build tools installed:

- **macOS:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
- **Windows:** `npm install --global --production windows-build-tools`

### "Anthropic API Key not found"

The capture hook requires `ANTHROPIC_API_KEY` to be set in your environment. Add it to your `.zshrc`, `.bashrc`, or `.env` file.

### Claude isn't using the memories

Run `somtum doctor` to verify that hooks are correctly installed in your project.

---

## Contributing

Contributions are welcome! If you'd like to help improve Somtum, please see our [CONTRIBUTING.md](CONTRIBUTING.md) for a guide on how to get started.

**Important Note for Contributors:** This project uses `changesets` for versioning. Every PR must include a changeset file generated by running `pnpm changeset`.

---

## License

Licensed under the [MIT License](LICENSE).
