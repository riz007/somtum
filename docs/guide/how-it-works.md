# How It Works

At the end of each Claude Code session, Somtum reads the session transcript and asks Claude Haiku to extract the parts worth keeping — decisions, bug fixes, things learned. Those observations are stored locally in SQLite. **On every subsequent prompt**, Somtum automatically retrieves the most relevant memories and injects them into context.

## Memory lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                      │
│          you code · debug · review · make decisions         │
└──────────────────────────────┬──────────────────────────────┘
                               │ SessionEnd / PreCompact
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Capture Pipeline                        │
│                                                             │
│  session transcript ──► Haiku extracts observations         │
│                                                             │
│      decisions · bug fixes · learnings · commands           │
│                                                             │
│  PreCompact ─── writes warm-start file ──► next session     │
└──────────────────────────────┬──────────────────────────────┘
                               │ persisted locally
                               ▼
                 ┌─────────────────────────┐
                 │  ~/.somtum/projects/    │
                 │     <project-hash>/     │
                 │                         │
                 │  db.sqlite              │
                 │  index.md               │
                 │  memories/YYYY-MM/      │
                 └────────────┬────────────┘
                              │ every prompt (UserPromptSubmit)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Auto-Inject Pipeline                      │
│                                                             │
│  1. Prompt cache lookup (exact + fuzzy match)               │
│  2. BM25 recall — top-k relevant memories                   │
│  3. Warm-start context (if session just compacted)          │
│                                                             │
│      all injected as additionalContext automatically        │
└─────────────────────────────────────────────────────────────┘
```

## What gets captured — an example

You debug an auth bug and refactor a module. At session end, Somtum extracts something like:

```json
[
  {
    "kind": "bugfix",
    "title": "JWT refresh loop caused by missing expiry check",
    "body": "The refresh token loop was triggered because we checked token.exp < Date.now() instead of token.exp < Date.now() / 1000. Unix timestamps are in seconds, not milliseconds.",
    "files": ["src/auth/refresh.ts"]
  },
  {
    "kind": "decision",
    "title": "Use pnpm workspaces — npm hoisting breaks shared types",
    "body": "Switched from npm to pnpm because npm's hoisting puts shared type packages in the wrong node_modules scope, breaking type inference across packages.",
    "files": ["package.json", "pnpm-workspace.yaml"]
  }
]
```

Next session, when you ask "why are we using pnpm?" or open `src/auth/refresh.ts`, Claude finds these memories and already has the context.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code / Agent                     │
└──────────┬──────────────────────────────┬───────────────────┘
           │ hooks                        │ MCP tools
           ▼                              ▼
┌─────────────────────┐         ┌──────────────────────────┐
│  Hooks              │         │   MCP Tools              │
│                     │         │                          │
│  UserPromptSubmit ──┼─cache──▶│ cache_lookup             │
│                   ──┼─inject─▶│ recall / get             │
│  SessionEnd ────────┼─capture▶│ remember / update        │
│  PreCompact ────────┼─warmst─▶│ forget                   │
│  PreToolUse (Read) ─┼─gate───▶│ stats                    │
│                     │         │ report_false_hit          │
└──────────┬──────────┘         └────────────┬─────────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core (TypeScript)                      │
│                                                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ PromptCache  │  │  MemoryStore    │  │   Retriever   │  │
│  │              │  │                 │  │               │  │
│  │ exact hash   │  │ observations    │  │ bm25(default) │  │
│  │ fuzzy embed  │  │ scope: project  │  │ embeddings    │  │
│  │ fingerprint  │  │         global  │  │ index         │  │
│  │ false_hits   │  │       workspace │  │ hybrid        │  │
│  └──────────────┘  └─────────────────┘  └───────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  SQLite WAL + ~/.somtum/     │
                └─────────────────────────────┘
```

## Retrieval strategies

| Strategy | How it works | Best for | Cost |
| --- | --- | --- | --- |
| **`bm25`** | Keyword search over title + body + tags (SQLite FTS5, no external dependencies) | Exact terms, offline setups | Near-zero |
| **`embeddings`** | Semantic similarity using a 30 MB local ONNX model (bge-small-en-v1.5, fully in-process) | "What did we decide about auth?" style queries | ~5 ms at 10k memories |
| **`index`** | Sends a compact memory catalog to Haiku; the model picks relevant IDs | Paraphrased or fuzzy queries | 1 Haiku API call |
| **`hybrid`** | BM25 + embeddings results merged and re-ranked by Haiku | General case (best recall) | BM25 + embeddings + 1 Haiku call |

**Default is `bm25`** — works offline, no setup required. Enable `hybrid` once you have embeddings downloaded.

To switch strategy:

```bash
# Enable semantic search (downloads 30 MB model once)
somtum config set retrieval.embeddings.enabled true
somtum reindex

# Switch to hybrid for best recall
somtum config set retrieval.strategy hybrid
```

See [Configuration](/reference/configuration) for the full options.

## Memory kinds

Somtum captures observations in six categories:

| Kind | Description |
| --- | --- |
| `decision` | Architectural or design choices and their rationale |
| `learning` | Things discovered during debugging or exploration |
| `bugfix` | A fix and its root cause |
| `command` | Useful CLI commands or workflows |
| `file_summary` | A summary of what a file or module does |
| `other` | Anything else worth remembering |
