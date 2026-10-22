---
'somtum': major
---

Somtum is now memory for coding agents, not only Claude Code.

**New**

- Codex support: `somtum init --agent codex` installs hooks in `.codex/hooks.json` and the MCP server in `.codex/config.toml`. Claude Code and Codex share one memory per project.
- Selectable extraction backend, `extraction.backend`: `auto` (default), `anthropic`, `claude-cli` or `codex-cli`. Anthropic-compatible providers such as GLM work through `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`.
- `somtum doctor` checks the extraction backend and hooks for either agent.

**Fixes**

- Sessions that ended mid-task were sometimes continued by the extraction model instead of analyzed, and saved as 0 memories with `ok` in the log.
- The `claude` CLI extraction path sent ~37k tokens of Claude Code's own system prompt, tools and CLAUDE.md with every call.
- Tool-call arguments (whole files in edits) were sent to the extractor untrimmed, crowding out the conversation.
- File summaries could push the session-end hook past its 90 s limit, so `index.md` and the warm-start file were not written.

**Breaking**

- `somtum doctor`: the `api_key` check is renamed `extraction_backend`. Update scripts that read `doctor --json`.
- Extraction output differs from v2 for the same transcript (new prompt; the per-session cap is passed to the model).
- `hook.log`: `ANTHROPIC_API_KEY not set — using claude CLI fallback` is replaced by `extraction backend: <name>`.

Stored memories, config and database need no migration. See https://riz007.github.io/somtum/guide/upgrading-v3
