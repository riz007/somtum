---
layout: home

hero:
  name: "Somtum"
  text: "Local-first memory for Claude Code"
  tagline: Automatically captures decisions, bug fixes, and learnings from every session — and injects them back on the next one. No cloud. No config. Just memory.
  image:
    src: /logo.png
    alt: Somtum
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: How It Works
      link: /guide/how-it-works
    - theme: alt
      text: GitHub
      link: https://github.com/riz007/somtum

features:
  - icon: 🥣
    title: Automatic Capture
    details: At session end, Claude Haiku extracts durable observations from the transcript — decisions, bug fixes, learnings, commands — and stores them in a local SQLite database.
  - icon: ⚡
    title: Auto-Inject on Every Prompt
    details: The UserPromptSubmit hook retrieves the most relevant memories via BM25 and injects them before every message. No manual recall step needed.
  - icon: 🌶️
    title: Prompt Cache
    details: Exact and fuzzy-matched prompts skip the model entirely. The cache saves API credits and keeps sessions fast.
  - icon: 🥕
    title: Local-Only Storage
    details: All data lives in a local SQLite WAL database at ~/.somtum/. No cloud accounts, no telemetry, no data leaves your machine except to the Anthropic API.
  - icon: 🌐
    title: Global Memory
    details: Store personal preferences or workspace conventions once with `scope='global'` — they are injected across every project automatically via ~/.somtum/global.db.
  - icon: 🔁
    title: Memory Deduplication
    details: After each session, near-duplicate observations are detected by title similarity and the older one is marked superseded. Your memory stays clean without manual pruning.
  - icon: 📊
    title: Visual Dashboard
    details: Run `somtum serve` to open a browser dashboard — searchable memory browser, knowledge graph, analytics, and a forget button. GitHub dark theme, readable at any zoom.
  - icon: 🔄
    title: Multi-Device Sync
    details: Synchronize memories across machines with SSH. Hostname-aware merging ensures no data loss across sessions from different machines.
---

## Install in 30 seconds

```bash
npm install -g somtum
somtum init --all   # installs hooks + MCP server in current project
```

That's it. Every Claude Code session from here will be captured and remembered.

---

## What gets remembered

After a debugging session, Somtum extracts observations like these and stores them locally:

```json
[
  {
    "kind": "bugfix",
    "title": "JWT refresh loop — Unix timestamps are seconds, not ms",
    "body": "Checked token.exp < Date.now() instead of token.exp < Date.now() / 1000."
  },
  {
    "kind": "decision",
    "title": "Use pnpm workspaces — npm hoisting breaks shared types",
    "body": "Switched from npm because hoisting put shared type packages in the wrong scope."
  }
]
```

Next session, when you ask "why are we using pnpm?" Claude already knows. No re-explanation needed.

---

## Health check

Run `somtum doctor` after install to verify your setup:

```
✓  config          strategy=bm25, k=8
✓  db_open         WAL mode, foreign_keys ON
✓  hooks_installed somtum hooks found in .claude/settings.json
✓  embeddings      disabled (set retrieval.embeddings.enabled=true to enable)
```

::: warning Hybrid strategy requires embeddings
If `doctor` reports `strategy=hybrid` but `embeddings: disabled`, somtum silently falls back to BM25 while paying hybrid overhead. Fix it with one command:

```bash
somtum config set retrieval.strategy bm25   # match what's actually running
```

Or enable full hybrid (requires `ANTHROPIC_API_KEY`):

```bash
somtum config set retrieval.embeddings.enabled true
```

See [Configuration → Retrieval strategy](/reference/configuration#retrieval-strategy-comparison) for details.
:::

---

## Token efficiency

`somtum stats` shows whether memory is paying for itself:

| Metric | Good sign | What to check |
| --- | --- | --- |
| `breakeven` ≥ 1.5x | Saving more than you spend | Expected after ~20+ memories |
| `cache hits` > 0 | Repeated queries are cached | Confirm `cache.enabled = true` |
| `retrieval calls` accumulating | Memories being actively recalled | Check `injection.enabled = true` |

A fresh project (< 10 memories) will often show a net negative — this is normal and improves with use.
