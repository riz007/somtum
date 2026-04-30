---
'somtum': patch
---

- Redesigned `somtum serve` dashboard UI (light/dark theme support, improved layout)
- `somtum stats` now shows a setup hint when no memories have been captured yet, distinguishing between a missing `ANTHROPIC_API_KEY` and a hook that has not fired yet
- `somtum doctor` gains a new `api_key` check that reports whether `ANTHROPIC_API_KEY` is set
- Hook runner logs activity to `~/.somtum/hook.log` and emits a warning when `ANTHROPIC_API_KEY` is missing before the `post_session` extraction runs
- `somtum serve` port option now accepts `-p` shorthand and defaults gracefully when omitted
