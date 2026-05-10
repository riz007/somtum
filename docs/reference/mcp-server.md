# MCP Server

When you run `somtum init --all`, Somtum registers an MCP server that Claude can call autonomously during a session.

## Available tools

| Tool | What Claude does with it |
| --- | --- |
| `recall` | Searches memories when unsure about a project detail. Accepts `strategy` and `scope` overrides. |
| `get` | Retrieves full observation bodies by ID. Bumps `last_confirmed_at` on each hit. |
| `remember` | Stores an observation manually. Accepts `scope: 'project' \| 'workspace' \| 'global'`. |
| `update` | Updates an existing observation's title, body, tags, or files. Redaction is applied. |
| `cache_lookup` | Checks the prompt cache directly. |
| `report_false_hit` | Reports that a cached response didn't answer the question (tunes fuzzy threshold data). |
| `forget` | Soft-deletes an observation. |
| `stats` | Reports tokens saved, cache hit rate, false-hit count, and corpus size. |

Every MCP response includes a `tokens` field so Claude can account for retrieval cost.

## Memory scope

Observations carry a `scope` field that controls visibility:

| Scope | Meaning | Use it when |
| --- | --- | --- |
| `project` | Default. Visible only in this project. | Most decisions, bugfixes, and learnings. |
| `workspace` | Shared across projects via the `recall` MCP tool. | Team conventions, preferred libraries, global rules. |
| `global` | Same as workspace; reserved for personal preferences that span all projects. | Your personal coding preferences. |

```bash
# Store a workspace-scoped observation from within a session:
remember("Always use pnpm for Node projects", body="...", scope="workspace")
```

## Setup

`somtum init --all` writes `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "somtum": {
      "command": "somtum",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Code after running `somtum init --all` to pick up the MCP configuration.

::: tip Verifying
Check `.mcp.json` exists in your project root:

```bash
cat .mcp.json
```
:::
