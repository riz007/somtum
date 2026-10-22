---
'somtum': minor
---

Codex support (`somtum init --agent codex`) and a selectable extraction backend (`extraction.backend`: anthropic, claude-cli, codex-cli; Anthropic-compatible providers via `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`). Fixes sessions being silently lost when the extractor continued the transcript instead of extracting, cuts extractor input by truncating tool-call arguments, removes ~37k tokens of overhead from each `claude -p` extraction call, and keeps file summaries from pushing the hook past its timeout.
