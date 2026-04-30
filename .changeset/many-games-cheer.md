---
'somtum': minor
---

`ANTHROPIC_API_KEY` is now optional. When not set, the `SessionEnd` hook falls back to `claude --print` (the Claude Code CLI) so Claude Code subscribers need no separate API key. The `api_key` doctor check now passes when either the key or the CLI is available, and `claudeCodeCaller()` is exported from the public API.
