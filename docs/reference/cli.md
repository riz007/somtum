# CLI Reference

## Setup

| Command | Description |
| --- | --- |
| `somtum init` | Install the SessionEnd capture hook |
| `somtum init --cache` | Also install the UserPromptSubmit cache + auto-inject hook |
| `somtum init --file-gating` | Also install the PreToolUse file-gating hook |
| `somtum init --all` | Install all hooks + MCP server |
| `somtum init --force` | Reinstall even if hooks are already present |
| `somtum doctor` | Check DB health, migrations, hooks, API key, breakeven ratio, stale memories |

## Memory

| Command | Description |
| --- | --- |
| `somtum list` | List stored memories (most recent first) |
| `somtum list --kind decision` | Filter by kind: `decision \| learning \| bugfix \| command \| file_summary` |
| `somtum list --limit 20` | Limit to 20 results |
| `somtum list --json` | Machine-readable JSON output |
| `somtum search <query>` | Search observations (default: `bm25` strategy) |
| `somtum search <query> --strategy hybrid` | Force a specific retrieval strategy |
| `somtum search <query> -k 16` | Return more results |
| `somtum show <id>` | Print the full body of an observation |
| `somtum remember` | Manually store an observation |
| `somtum forget <id>` | Soft-delete an observation by id |
| `somtum forget --all` | Soft-delete **all** observations in the current project |
| `somtum edit <id>` | Open an observation body in `$EDITOR` |
| `somtum rebuild` | Regenerate `index.md` from all observations |
| `somtum reindex` | Recompute embeddings (after enabling embeddings or changing model) |
| `somtum suggest-claude-md` | Suggest CLAUDE.md additions from accumulated observations (interactive) |
| `somtum suggest-claude-md --dry-run` | Preview suggestions without writing |
| `somtum suggest-claude-md --yes --limit 20` | Auto-confirm, limit to top 20 by tokens saved |

## Stats & Visibility

| Command | Description |
| --- | --- |
| `somtum stats` | Tokens saved, cache hit rate, retrieval breakdown |
| `somtum stats --json` | Machine-readable JSON output |
| `somtum serve` | Open the visual dashboard in the browser |
| `somtum serve --port <n>` | Use a custom port (default: 3000) |
| `somtum serve --no-open` | Start server without opening the browser |

## Data Management

| Command | Description |
| --- | --- |
| `somtum export` | Export observations to stdout as JSON |
| `somtum export --format jsonl --output obs.jsonl` | Export as JSONL file |
| `somtum export --format markdown` | Export as readable Markdown |
| `somtum export --include-deleted` | Include soft-deleted entries |
| `somtum import <file>` | Import observations from JSON or JSONL |
| `somtum purge --older-than 30d` | Hard-delete soft-deleted entries older than 30 days |
| `somtum purge --older-than 30d --dry-run` | Preview without deleting |
| `somtum reset` | **Permanently** wipe all memories for the current project (asks to confirm) |
| `somtum reset --yes` | Skip confirmation (useful in CI or scripts) |

## Configuration

| Command | Description |
| --- | --- |
| `somtum config get` | Print the full resolved config |
| `somtum config get retrieval.strategy` | Read a single key (dot-separated) |
| `somtum config set retrieval.strategy hybrid` | Write to `.somtum/config.json` |
| `somtum config set retrieval.embeddings.enabled true --global` | Write to `~/.somtum/config.json` |

## Sync

| Command | Description |
| --- | --- |
| `somtum sync status` | Compare local vs remote observation count |
| `somtum sync push` | Export and scp observations to remote |
| `somtum sync pull` | scp from remote and merge into local DB |

Set your remote:

```bash
somtum config set sync.remote "user@host:/path/.somtum/projects/<id>"
```

Somtum uses hostname-aware syncing — merging observations from multiple machines without data loss.
