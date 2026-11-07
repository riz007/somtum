---
layout: home

hero:
  name: "Somtum"
  text: "Memory for coding agents, with a meter on it"
  tagline: Claude Code and Codex forget everything when a session ends. Somtum keeps the decisions, root causes and hard-won commands in a local database, hands the relevant ones back on later prompts, and records every token it spends doing it.
  image:
    src: /logo.png
    alt: Somtum
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What It Costs
      link: /guide/costs
    - theme: alt
      text: GitHub
      link: https://github.com/riz007/somtum

features:
  - icon: 🥣
    title: Captures what's worth keeping
    details: When a session ends or compacts, a small model you already have (the claude or codex CLI, or an API key) turns the new part of the conversation into short records — decisions, bug fixes, learnings, commands.
  - icon: ⚡
    title: Recalls it on the next prompt
    details: A local keyword search picks up to 3 relevant memories, capped at 1,500 characters. Nothing is added when nothing matches, and a memory already in context isn't sent again.
  - icon: 🧾
    title: Meters every token
    details: Extraction, injected context and file gating each write to a local ledger. <code>somtum stats</code> shows what Somtum spent, and what it saved where that can be measured.
  - icon: 🤝
    title: One memory, every agent
    details: Claude Code and Codex share one memory per project. Fix a bug in one, and the other knows tomorrow. Any MCP client can call recall and remember too.
  - icon: 🥕
    title: Local by default
    details: Memories live in SQLite under ~/.somtum. No account, no telemetry. Data leaves your machine only in model calls through the backend you chose.
  - icon: 🧹
    title: Stays tidy
    details: Near-duplicate memories are superseded automatically, secrets are redacted before storage, and stale memories are flagged by <code>somtum doctor</code>.
---

## Install

```bash
npm install -g somtum
cd your-project            # where you launch your agent
somtum init                # Claude Code
somtum init --agent codex  # Codex — run both if you use both
somtum doctor
```

On a fresh project, `doctor` should look like this:

```
✓  config                 strategy=bm25, k=8
✓  db_file                ~/.somtum/projects/669486bb9c9fde29/db.sqlite
✓  migrations             applied: [1, 2, 3, 4, 5, 6]
✓  memories               0 memories
✓  token_overhead         0 tokens metered (extraction 0, summaries 0, injected 0); see `somtum stats`
✓  extraction_backend     claude-cli (auto)
✓  hooks_installed        somtum hooks found in .claude/settings.json
```

Then work as usual. Memories appear after your first substantial session ends or compacts.

---

## What gets remembered

```json
[
  {
    "kind": "bugfix",
    "title": "JWT refresh loop: exp is in seconds, not ms",
    "body": "Compared token.exp against Date.now(); must divide by 1000."
  },
  {
    "kind": "decision",
    "title": "Use pnpm workspaces: npm hoisting breaks shared types",
    "body": "Switched from npm because hoisting put shared type packages in the wrong scope."
  }
]
```

Next session, ask "why are we on pnpm?" and the agent already knows.

---

## What it costs

| Cost | Bound |
| --- | --- |
| Extraction at session end or compaction | Only turns not yet extracted. No call under 500 new tokens. |
| Memories added to a prompt | At most 3 memories and 1,500 characters, only on a match, once per session |
| File summaries | None unless you turn on file gating |

```
Somtum's own token use, metered (all time)
  extraction            4 calls     54,785 tok   1 skipped
  injected context   14 prompts      4,060 tok   added to your agent's input
  total                             58,845 tok
```

On three real sessions that each compacted once, extracting only new turns cut extraction tokens by 35–47% compared with v3.0. Somtum can't measure how much re-explaining a memory saved you, and `stats` says so rather than guessing quietly. [Read the full cost model →](/guide/costs)
