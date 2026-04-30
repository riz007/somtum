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
- [Verifying the setup](#verifying-the-setup)
- [Dashboard](#dashboard)
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
- **Claude Code** — Somtum hooks into Claude Code's `SessionEnd`, `UserPromptSubmit`, and `PreToolUse` events
- **`ANTHROPIC_API_KEY`** _(optional)_ — if set, Somtum uses the Anthropic API directly for extraction (lets you choose the model explicitly). If not set, Somtum falls back to the `claude` CLI that ships with Claude Code, so **no separate API key is required for Claude Code subscribers**.

> `pnpm` is only required if building from source. Global npm/yarn installs have no pnpm dependency.

---

## Install

```bash
# npm (recommended for global install)
npm install -g somtum

# yarn
yarn global add somtum

# pnpm
pnpm add -g somtum
```

Or as a project dependency:

```bash
npm install somtum
```

### From source

```bash
git clone https://github.com/riz007/somtum
cd somtum
pnpm install
pnpm build
pnpm link --global
```

### Native module note

Somtum uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), which contains a native C++ addon. On most platforms (macOS, Linux x64/arm64, Windows x64) a prebuilt binary is downloaded automatically. On Alpine Linux / musl or unusual architectures the addon compiles from source — `python`, `make`, and `gcc` must be available. If the install fails with a node-gyp error, install those build tools and retry.

---

## Quickstart

### Step 1 — Choose your extraction backend

Somtum needs to call a Claude model at session end to extract observations. There are two options — pick one:

**Option A: Claude Code subscription (no extra setup)**

If you already have Claude Code installed, you're done. Somtum calls `claude --print` automatically when no API key is present. Skip to Step 2.

**Option B: Direct Anthropic API key (optional — faster, explicit model choice)**

If you want Somtum to call the API directly (useful if you use Somtum outside of a Claude Code environment, or want to pin a specific model), add to `~/.zshrc` (or `~/.bashrc`):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Then reload:

```bash
source ~/.zshrc
```

> When a `SessionEnd` hook fires, it inherits the environment of the shell that _started_ Claude Code — not the current terminal. So the key must be in your shell profile, not just `export`-ed in an open terminal tab.

### Step 2 — Install inside a Claude Code project

Run this from the **root of the project you work in with Claude Code**:

```bash
somtum init
```

This writes a `SessionEnd` hook into `.claude/settings.json` in the current directory. Claude Code reads that file automatically when you open a session from the same directory.

To enable all features at once:

```bash
somtum init --all
# Installs:
#   - SessionEnd capture hook     (memory extraction)
#   - UserPromptSubmit cache hook (prompt cache lookup)
#   - PreToolUse file-gating hook (file read summaries)
#   - MCP server in .mcp.json     (Claude can call recall/remember tools)
```

### Step 3 — Use Claude Code normally

Open a Claude Code session **from the same directory** where you ran `somtum init`. Work as you normally would. When the session ends, the hook extracts observations automatically in the background (capped at 90 seconds so it never blocks you).

### Step 4 — Check your memory

```bash
# How many observations were captured?
somtum stats

# Search memory
somtum search "auth jwt rotation"
somtum search "why we use pnpm" --strategy hybrid

# Open the visual dashboard
somtum serve
```

If `somtum stats` shows `memories 0` after a session, see [Troubleshooting](#troubleshooting).

### Step 5 — Diagnose any issues

```bash
somtum doctor
```

This checks your API key, DB health, hook installation, migrations, cache, and breakeven ratio. It will tell you exactly what is misconfigured and how to fix it.

---

## Verifying the setup

After your **first** Claude Code session ends:

**1. Check the hook log**

Every hook run appends a timestamped line to `~/.somtum/hook.log`:

```bash
cat ~/.somtum/hook.log
```

A successful run looks like:

```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

A run using the claude CLI fallback (no API key) looks like:

```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

A failed run (neither key nor CLI available) looks like:

```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:42.131Z [post_session] ERROR: Neither ANTHROPIC_API_KEY nor the claude CLI is available.
```

**2. Check stats**

```bash
somtum stats
```

You should see `memories` > 0 after a substantive session. Short test sessions may yield 0 observations if there is nothing worth extracting (Claude Code did not make decisions, fix bugs, or learn anything the extractor considers durable).

**3. Run doctor**

```bash
somtum doctor
```

All checks should show `✓`. The `api_key` and `hooks_installed` checks are the two most commonly failing.

---

## Dashboard

Somtum includes a visual memory browser you can open at any time:

```bash
somtum serve
# Opens http://localhost:3000 in your browser
```

The dashboard provides:

- **Memory browser** — searchable, filterable list of all captured observations. Supports BM25, hybrid, and embeddings strategies live. Click any memory to see its full body, files touched, and tags.
- **Knowledge graph** — vis-network graph where nodes are memories and edges connect memories that share files or tags. Clicking a node opens the detail panel.
- **Analytics** — kind breakdown, cache hit rate, retrieval strategy usage, and top-referenced files.
- **Forget button** — soft-delete any memory directly from the browser.

Options:

| Flag         | Description                            |
| ------------ | -------------------------------------- |
| `--port <n>` | Listen on a custom port (default 3000) |
| `--no-open`  | Don't auto-open the browser            |

Press `Ctrl-C` to stop the server.

---

## CLI Reference

### Setup

| Command                     | Description                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `somtum init`               | Install the SessionEnd capture hook                          |
| `somtum init --cache`       | Also install the UserPromptSubmit cache hook                 |
| `somtum init --file-gating` | Also install the PreToolUse file-gating hook                 |
| `somtum init --all`         | Install all hooks + MCP server                               |
| `somtum init --force`       | Reinstall even if hooks already present                      |
| `somtum doctor`             | Check DB health, migrations, hooks, API key, breakeven ratio |

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
| `somtum reindex`                        | Recompute embeddings (after a model change)      |

### Stats & Visibility

| Command                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `somtum stats`            | Tokens saved, cache hit rate, retrieval breakdown |
| `somtum stats --json`     | Machine-readable JSON output                      |
| `somtum serve`            | Open the visual dashboard in the browser          |
| `somtum serve --port <n>` | Use a custom port (default 3000)                  |
| `somtum serve --no-open`  | Start server without opening the browser          |

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

### Stats & visibility

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `somtum reindex` | Embed observations that are missing vectors |

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

| Tool           | What Claude can do with it                                             |
| -------------- | ---------------------------------------------------------------------- |
| `recall`       | Search memories by natural language when unsure about a project detail |
| `get`          | Retrieve the full body of specific observations by ID                  |
| `remember`     | Manually store an observation from within a session                    |
| `cache_lookup` | Check the prompt cache directly                                        |
| `forget`       | Soft-delete an observation                                             |
| `stats`        | Report on tokens saved, cache hit rate, and corpus size                |

Every MCP response includes a `tokens` field so Claude can account for retrieval cost.

---

## Dashboard

`somtum serve` opens a local web dashboard at `http://localhost:3000`:

- **Memory browser** — search across all observations using BM25, hybrid, or embedding-based retrieval; filter by kind (decision, bugfix, learning, command, file_summary); forget memories directly from the UI.
- **Knowledge graph** — vis-network graph where nodes are observations, edges represent shared files or tags. Clicking a node selects the memory in the list and vice versa.
- **Analytics tab** — kind breakdown, token ROI (saved vs. spent), cache hit rate + entry count, retrieval strategy usage, and top files by reference count.
- **Stat bar** — live counts for total memories, tokens saved, tokens spent, ROI ratio, and cache hit %.

```bash
somtum serve              # opens on port 3000
somtum serve --port 4000  # custom port
somtum serve --no-open    # don't auto-open the browser
```

---

## Storage layout

```
~/.somtum/
├── config.json                    ← global config (overridden by project config)
├── hook.log                       ← timestamped log of every hook execution
└── projects/
    └── <project_id>/
        ├── db.sqlite              ← source of truth (SQLite WAL)
        ├── index.md               ← regenerated human-readable mirror
        └── memories/
            └── YYYY-MM/
                └── <ulid>.md      ← per-observation markdown files
```

The project ID is derived from the git remote URL (if present) or the directory path — the same project always maps to the same ID regardless of which machine you're on, as long as the remote URL matches.

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
    "fuzzy_threshold": 0.92, // raise to 0.95 once you have signal
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

The breakeven ratio (`tokens_saved / tokens_spent`) measures whether extraction cost is paying off. A ratio below 1.5× triggers a warning in `somtum stats` and `somtum doctor`.

---

## Performance

| Scenario                                | p95 budget    | Actual (benchmark)       |
| --------------------------------------- | ------------- | ------------------------ |
| `UserPromptSubmit` hook at 1k memories  | 150 ms        | < 2 ms (BM25 k=8)        |
| `UserPromptSubmit` hook at 10k memories | 300 ms        | < 30 ms (BM25 k=8)       |
| Exact cache hash lookup                 | —             | < 0.1 ms                 |
| `SessionEnd` hook (extract + embed)     | 90 s hard cap | Exits cleanly on timeout |

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
pnpm build            # tsc + copy migrations + copy dashboard → dist/
```

### Project layout

```
src/
  cli/
    index.ts          # commander CLI entry point
    init.ts           # somtum init — installs hooks + MCP config
    serve.ts          # somtum serve — local dashboard server
    stats.ts          # somtum stats
    doctor.ts         # somtum doctor — health checks
    hook.ts           # internal: dispatches hook events by name
    search.ts / show.ts / forget.ts / edit.ts
    export.ts / import.ts / purge.ts / sync.ts / rebuild.ts / reindex.ts
    config_cmd.ts
  core/
    db.ts             # SQLite setup, migration runner
    store.ts          # MemoryStore — CRUD for observations
    cache.ts          # PromptCache — exact + fuzzy lookup
    retriever/        # bm25, embeddings, hybrid, index, factory
    extractor.ts      # session transcript → observations (Claude Haiku)
    index_gen.ts      # renders index.md (incremental past 1k obs)
    memory_files.ts   # writes memories/<YYYY-MM>/<ulid>.md
    retrieval_stats.ts
    embeddings.ts     # Embedder interface + encode/decode utils
    privacy.ts        # redact() — runs on every capture
    tokens.ts         # gpt-tokenizer wrapper
  hooks/
    post_session.ts   # SessionEnd: extract → store → index → log
    pre_prompt.ts     # UserPromptSubmit: cache lookup
    pre_read.ts       # PreToolUse: file gating
  mcp/               # MCP server + tool implementations
  dashboard/
    index.html        # single-page dashboard (served by somtum serve)
  config.ts          # global + project config merge
  index.ts           # public API for embedding Somtum
src/db/migrations/   # NNN_name.sql migration files
test/
  golden/            # per-strategy retrieval golden sets
  bench/             # hot-path latency benchmarks
  fixtures/          # synthetic session transcripts
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

## Troubleshooting

### `somtum stats` shows `memories 0` after a session

This almost always means the hook ran but extraction failed. Check the log first:

```bash
cat ~/.somtum/hook.log
```

Common causes:

**`claude` CLI not found and no `ANTHROPIC_API_KEY` set**

Somtum needs one of the two backends available when the `SessionEnd` hook fires. If neither is present, extraction silently fails.

- If you use Claude Code: make sure the `claude` binary is on your `PATH`. Run `which claude` — if it prints nothing, reinstall Claude Code or add it to `PATH`.
- If you prefer the direct API: add `export ANTHROPIC_API_KEY="sk-ant-..."` to `~/.zshrc` (or `~/.bashrc`) and `source ~/.zshrc`. The key must be in your shell profile because the hook subprocess inherits from the shell that _started_ Claude Code, not the current terminal tab.

Run `somtum doctor` — the `api_key` check will tell you exactly which path is available.

**Hook not installed in the right directory**

`somtum init` writes the hook to `.claude/settings.json` in the directory where you ran it. If you run Claude Code from a _different_ directory, it reads a different (or absent) settings file.

Fix: run `somtum init` from the same directory you use to launch Claude Code.

```bash
cd ~/my-project
somtum init
claude   # must be launched from ~/my-project
```

**Short or trivial session**

If the session didn't contain any decisions, bug fixes, or learnings (e.g. you just asked Claude to say hello), the extractor correctly returns 0 observations.

Try a real working session, then re-check.

**Run `somtum doctor`** for a full diagnostic:

```bash
somtum doctor
```

It checks extraction auth (API key or claude CLI), hook installation, DB health, embeddings, breakeven ratio, and more, with specific fix instructions for each failing check.

---

### `somtum serve` opens the browser but shows "Connection refused"

This was a bug fixed in v1.1.0. Upgrade:

```bash
npm install -g somtum@latest
```

If you installed from source, rebuild:

```bash
pnpm build
```

---

### `somtum serve` — port already in use

If port 3000 is busy, use `--port`:

```bash
somtum serve --port 3001
```

---

### Agent appears to keep running after session ends

The `SessionEnd` hook has a hard 90-second timeout — it cannot block Claude Code indefinitely. If sessions appear stuck immediately after installing Somtum, verify you are on v1.1.0+:

```bash
somtum --version
```

And check the log for any long-running operations:

```bash
tail -20 ~/.somtum/hook.log
```

---


### Installation fails (node-gyp / better-sqlite3)

If you see errors related to building `better-sqlite3`, ensure build tools are installed:

- **macOS:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
- **Windows:** `npm install --global --production windows-build-tools`

---

### Embeddings are slow or the model won't download

The first `somtum reindex` downloads a ~30 MB ONNX model (`bge-small-en-v1.5`) from Hugging Face. This requires internet access and may be slow on first run. Subsequent runs use the cached model.

If you are on an air-gapped machine or prefer not to use embeddings, disable them:

```bash
somtum config set retrieval.embeddings.enabled false
somtum config set retrieval.strategy bm25
```

BM25 retrieval works fully offline and is fast at any reasonable corpus size.

---

### Claude isn't using the memories

If you are using the MCP server (`somtum init --all`), Claude will automatically call `recall` when it's uncertain about project details. If it's not happening:

1. Confirm `.mcp.json` exists in your project root: `cat .mcp.json`
2. Restart Claude Code so it picks up the new MCP config
3. Try prompting Claude explicitly: _"Check your Somtum memory for anything related to our auth setup"_

If you are not using the MCP server, memories are injected via the `index.md` file — add it to your CLAUDE.md or Claude Code context with:

```
See ~/.somtum/projects/<project_id>/index.md for prior session learnings.
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for the guide.

**Important:** This project uses `changesets` for versioning. Every PR must include a changeset file generated by running `pnpm changeset`.

---

## License

Licensed under the [MIT License](LICENSE).
