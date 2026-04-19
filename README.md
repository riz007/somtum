<img src="./assets/logo.png" width="500" alt="Somtum Logo">

Local-first memory layer for Claude Code. Somtum captures durable observations
from your Claude Code sessions — decisions, bugfixes, learnings, file summaries —
and keeps them in a local SQLite database you can search from the CLI.

Zero-config: one `somtum init` in an existing Claude Code project and the
capture hook is wired up. No server, no cloud account.

## Requirements

- Node 20 or newer
- pnpm
- `ANTHROPIC_API_KEY` in the environment (used by the capture hook to summarize
  session transcripts through Claude Haiku)

## Install

```bash
pnpm install
pnpm build
```

## Quickstart

```bash
# Inside an existing Claude Code project:
pnpm exec somtum init
# → writes .claude/settings.json with a SessionEnd hook

# Use Claude Code as normal. At session end, somtum extracts observations
# and stores them under ~/.somtum/projects/<id>/db.sqlite.

pnpm exec somtum search "auth jwt rotation"
pnpm exec somtum show 01JBZ...
pnpm exec somtum stats
pnpm exec somtum stats --json
```

## CLI

| Command                 | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `somtum init`           | Install the SessionEnd capture hook in the current project. |
| `somtum search <query>` | BM25 search over stored observations.                       |
| `somtum show <id>`      | Print the full body of an observation.                      |
| `somtum stats [--json]` | Cumulative tokens saved / spent (estimated).                |
| `somtum hook <name>`    | Internal: dispatched by the installed hook command.         |

## Storage layout

```
~/.somtum/
├── config.json
└── projects/
    └── <project_id>/
        ├── db.sqlite
        └── index.md
```

SQLite is the source of truth. `index.md` is a regenerated mirror — treat it as
read-only.

## Privacy

- No network traffic except to the Anthropic API (extraction only).
- Every capture runs through a configurable redaction pass. The defaults match
  common shapes for API keys, Bearer tokens, AWS access key IDs, and Slack
  tokens. Redaction runs even when telemetry is disabled.
- Additional patterns can be set in `~/.somtum/config.json` or a per-project
  `.somtum/config.json` under `privacy.redact_patterns`.

## Tokens-saved accounting

Counts are estimates produced by `gpt-tokenizer` (a BPE approximation). Every
`stats` figure is labelled "estimated"; the accounting intentionally undercounts
rather than overclaims.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm fmt
pnpm build
```

## License

MIT
