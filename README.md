<img src="./assets/logo.png" width="420" alt="Somtum">

**Long-term memory for Claude Code and Codex that meters every token it spends.**

[![npm version](https://badge.fury.io/js/somtum.svg)](https://www.npmjs.com/package/somtum)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Docs](https://riz007.github.io/somtum/) · [What it costs](https://riz007.github.io/somtum/guide/costs) · [CLI reference](https://riz007.github.io/somtum/reference/cli) · [Changelog](CHANGELOG.md)

Your coding agent forgets everything when a session ends or its context compacts. Somtum keeps the parts worth keeping (decisions, root causes, commands that finally worked) in a local SQLite database and hands the relevant ones back on later prompts. Claude Code and Codex share the same memory.

Memory is paid for in tokens, so Somtum is built to never multiply your bill. It only sends what it hasn't sent before, skips work that can't pay off, caps everything it adds to a prompt, and writes every token it spends to a ledger you can read with `somtum stats`.

Named after ส้มตำ, the Thai green papaya salad: shredded fine, only what's fresh.

## Quick start

```bash
npm install -g somtum
cd your-project           # the directory you launch your agent from
somtum init               # Claude Code: capture + recall hooks, MCP server
somtum init --agent codex # Codex (run both if you use both)
somtum doctor             # every line should show ✓
```

Then use your agent as usual. Memories appear after your first substantial session ends or compacts:

```bash
somtum list               # what was remembered
somtum stats              # what it cost
```

Requires Node 20+ and one way to run a small model for extraction. Somtum uses the first one it finds: `ANTHROPIC_API_KEY` (or an Anthropic-compatible provider through `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`), then the `claude` CLI, then the `codex` CLI. If you can run your agent, you already have one.

## What it does

**Captures.** When a session ends or compacts, Somtum sends the turns it hasn't seen yet to a small model (Claude Haiku by default) and stores what comes back as short typed records:

```json
{
  "kind": "bugfix",
  "title": "JWT refresh loop: exp is in seconds, not ms",
  "body": "Compared token.exp against Date.now(); must divide by 1000.",
  "files": ["src/auth/refresh.ts"]
}
```

**Recalls.** On each prompt, a local keyword search (SQLite FTS5, no network) picks up to 3 relevant memories and adds them to the agent's context, capped at 1,500 characters. A memory has to share at least two words with a longer prompt ("installed" counts as "install"). Nothing is added when nothing matches, and a memory that's already in the session's context isn't added again.

**Shares.** Claude Code and Codex read and write one memory per project. Any MCP client can use the `recall` and `remember` tools. Memories saved with `scope: "global"` follow you into every project.

Everything is stored under `~/.somtum/`. Data leaves your machine only in model calls through the backend you chose: extraction, plus file summaries if you turn on file gating.

## What it costs

Somtum spends tokens in two places: on extraction, and on the context it adds to your prompts. Both are bounded, and both are metered.

| Cost | When | Bound | Turn it down |
| --- | --- | --- | --- |
| Extraction | Session end or compaction | Only turns not yet extracted, at most 60k tokens. No call when fewer than 500 new tokens. | `extraction.min_new_tokens`, `extraction.max_observations_per_session` |
| Injected memories | A prompt that matches stored memories | Up to 3 memories, 1,500 characters (about 375 tokens). A memory already in context is not re-sent. | `injection.k`, `injection.max_chars`, `injection.enabled` |
| File summaries | Only if you enable file gating | One small-model call per large file that changed | `file_gating.enabled` (off by default) |

`somtum stats` reads the ledger. This is real output:

```
Somtum's own token use, metered (all time)
  extraction            4 calls     54,785 tok   1 skipped
  injected context   14 prompts      4,060 tok   added to your agent's input
  total                             58,845 tok
```

Use `somtum stats --since 7d` for a window, or `--json` to feed it into something else. Extraction runs on whatever backend you configured. On the `claude` or `codex` CLI, it draws on your existing plan rather than a separate bill.

### Measured: not paying twice for the same transcript

Through v3.0, a session that compacted and then ended was extracted twice, and the second call re-sent everything the first had already processed. Somtum now keeps a per-session cursor and sends only new turns. These numbers come from replaying three real Claude Code sessions through the pipeline with a stub model, each compacting once at 60% of its length. Tokens are counted over the exact extraction requests, using the same tokenizer approximation `somtum stats` uses:

| Session | Turns | v3.0 extraction tokens | v3.1 extraction tokens | Saved |
| --- | ---: | ---: | ---: | ---: |
| Web app redesign | 309 | 64,577 | 41,756 | 35% |
| API service | 36 | 47,892 | 25,498 | 47% |
| Course assignment | 132 | 21,966 | 13,029 | 41% |

### What Somtum cannot measure

The tokens you save because the agent already knew something (the npm-vs-pnpm argument you didn't have again) never show up in any transcript, so Somtum can't count them. `somtum stats` shows a heuristic estimate for this and labels it as one. Somtum also only sees what's in transcripts: model calls your agent makes that never appear there are invisible to it. For whole-agent spend, use your agent's own usage reporting, such as Claude Code's OpenTelemetry export.

## File gating (opt-in)

With file gating on, the first time the agent tries to read a whole large file in a session, Somtum answers with a summary of it, generated earlier, as long as the file hasn't changed since. If the agent needs the actual contents, it reads the file again and that read goes through. Partial reads (with an offset or limit) are never gated.

Whether this saves anything depends on how often a summary is enough, so it's metered on both sides. `somtum stats` shows full reads avoided, summary tokens shown, and files read anyway, plus the net. After 10 gated reads, `somtum doctor` tells you to turn it off if the net is negative.

```bash
somtum init --file-gating   # installs the hook and turns it on for this project
```

Claude Code only.

## Everyday commands

| Command | What it does |
| --- | --- |
| `somtum doctor` | Checks setup: backend, hooks, database, and whether file gating pays off |
| `somtum stats` | Metered token use, memory counts, cache stats |
| `somtum list` / `somtum search <query>` | Browse or search memories |
| `somtum show <id>` / `somtum edit <id>` / `somtum forget <id>` | Read, fix or delete one memory |
| `somtum serve` | Local dashboard: memory browser, graph, analytics |
| `somtum suggest-claude-md` | Suggest `CLAUDE.md` additions from your memories |
| `somtum export` / `somtum import` | Move memories as JSON, JSONL or Markdown |

Full list: [CLI reference](https://riz007.github.io/somtum/reference/cli). Settings: [configuration](https://riz007.github.io/somtum/reference/configuration).

## How it works

```
 Claude Code / Codex
   │  SessionEnd, PreCompact        ─────► extract new turns ─► small model ─► observations
   │                                                                              │
   │  UserPromptSubmit              ◄───── top memories (FTS5/BM25, local) ◄──────┤
   │                                                                              │
   │  PreToolUse Read (opt-in)      ◄───── file summary instead of full read ◄────┤
   │                                                                              ▼
   │  MCP: recall · remember · get · update · forget · stats      ~/.somtum/projects/<id>/db.sqlite
   │                                                               ~/.somtum/global.db
   │                                                              token ledger (every event above)
```

Details, including retrieval strategies, deduplication and warm starts after compaction: [How it works](https://riz007.github.io/somtum/guide/how-it-works).

## Upgrading from 3.0

- `somtum init` now installs the recall hook by default, matching Codex. `--all` is no longer needed; use `--no-cache` for capture only.
- File gating is now **off by default**. In 3.0 it was on, and it generated file summaries at every session end even in projects that never installed its hook. If you used it, `somtum doctor` will say so: run `somtum init --file-gating --force` to turn it back on and update the hook to match `Read` only.
- File gating now answers a whole-file read with the summary *instead* of the file. In 3.0 it added the summary *on top of* the full read, so it could only cost tokens.
- `somtum stats` leads with metered numbers. The old `breakeven` ratio divided an estimate by an undercount, so it was removed from the human-readable output and from `doctor`. The JSON fields are unchanged.

## Privacy

- Secrets matching `privacy.redact_patterns` (API keys, bearer tokens, AWS keys and similar) are redacted before anything is stored.
- `.env` files and `secrets/` directories are never summarized.
- Injected memories are wrapped in markers that tell the agent they are reference material, not instructions.
- No telemetry. `somtum forget` soft-deletes; `somtum purge` removes for good.

## Development

```bash
git clone https://github.com/riz007/somtum && cd somtum
pnpm install
pnpm test          # unit, integration and golden retrieval tests
pnpm typecheck && pnpm lint
pnpm build         # dist/, then `pnpm link --global` to try your build
```

Where things live:

| Path | What |
| --- | --- |
| `src/hooks/` | The three hook handlers: `post_session` (capture), `pre_prompt` (recall), `pre_read` (file gating) |
| `src/core/` | Store, retrieval, extraction, token ledger, transcript parsing |
| `src/agents/` | One adapter per agent transcript format. Add an agent here |
| `src/cli/` | One file per command |
| `src/db/migrations/` | Numbered, additive SQL migrations |

Two rules for changes: a hook must never break or block the agent's session, and any new token spend must be bounded and recorded in the ledger. Every PR needs a changeset (`pnpm changeset`). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SPEC.md](SPEC.md) for what's planned.

## License

[MIT](LICENSE)
