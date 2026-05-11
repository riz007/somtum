# Dashboard

Somtum includes a local web dashboard for browsing and managing your memories visually.

The dashboard uses a GitHub-style dark theme (Inter font, `#0d1117` background, `#2f81f7` accent) and is designed to be readable at all zoom levels — minimum font size 11px, body text 14px.

## Starting the dashboard

```bash
somtum serve
# Opens http://localhost:3000
```

Press `Ctrl-C` to stop.

## Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--port <n>` | 3000 | Listen on a custom port |
| `--no-open` | — | Start server without opening the browser |

```bash
somtum serve --port 3001
somtum serve --no-open
```

## Views

### Memory browser

A searchable, filterable list of all captured observations. You can:

- Switch between BM25, hybrid, and embeddings retrieval strategies live
- Filter by kind (`decision`, `bugfix`, `learning`, etc.)
- Click any memory to see its full body, associated files, and tags

### Knowledge graph

Nodes are memories; edges connect memories that share files or tags. Click a node to open it in the detail panel. Useful for seeing clusters of related decisions and learnings.

### Analytics

- Kind breakdown (how many decisions vs bugfixes vs learnings)
- Cache hit rate over time
- Retrieval strategy usage
- Top-referenced files

### Forget button

Soft-delete any memory directly from the browser. Deleted memories can be recovered with:

```bash
somtum export --include-deleted
```

Or hard-deleted permanently with:

```bash
somtum purge --older-than 0d
```
