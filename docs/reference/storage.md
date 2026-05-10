# Storage Layout

All data lives under `~/.somtum/`:

```
~/.somtum/
├── config.json                         ← global config (merged with project config)
├── hook.log                            ← timestamped log of every hook execution
├── session/
│   └── lh_<id>.json                    ← last cache-hit state per project (false-hit detection)
│                                         files older than 24 h are evicted automatically
├── warmstart/
│   └── ws_<id>_<timestamp>.json        ← warm-start context written after PreCompact (30 min TTL)
│                                         timestamped so concurrent windows don't clobber each other
└── projects/
    └── <project_id>/
        ├── db.sqlite                   ← source of truth (SQLite WAL)
        ├── index.md                    ← human-readable mirror (regenerated on rebuild)
        └── memories/
            └── YYYY-MM/
                └── <ulid>.md           ← per-observation markdown files
```

## Project ID

The project ID is derived from the git remote URL (or directory path if no remote). The same project maps to the same ID across machines as long as the remote URL matches — which is what makes multi-device sync work.

## Source of truth

**SQLite is the source of truth.** Edit observations with `somtum edit <id>`, not by hand. `index.md` and the per-observation `.md` files are human-readable mirrors generated from the DB.

## Hook log

Every hook execution is appended to `~/.somtum/hook.log`. Check it when debugging:

```bash
cat ~/.somtum/hook.log
tail -20 ~/.somtum/hook.log
```

## Warm-start files

After a `PreCompact` event (context window compaction), Somtum writes a warm-start file containing the most recent context. On the next prompt, this is injected automatically so Claude picks up where it left off. Files expire after 30 minutes.

## Backing up or migrating

To move your memories to a new machine:

```bash
# Export from old machine
somtum export --format jsonl --output obs.jsonl

# Copy to new machine, then import
somtum import obs.jsonl
```

Or use the built-in sync:

```bash
somtum config set sync.remote "user@newhost:/path/.somtum/projects/<id>"
somtum sync push
```
