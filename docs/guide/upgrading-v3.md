# Upgrading to v3

v3 adds Codex support and fixes several capture problems in v2. If you used v2, read the first section to see whether they affected you.

```bash
npm install -g somtum@latest
somtum doctor
```

## What was wrong in v2

These were found by running Somtum against real Claude Code sessions. All are fixed in v3, with no action needed beyond upgrading.

| Problem | Who was affected | Effect |
| --- | --- | --- |
| A session that ended while the agent was mid-task was sometimes continued by the extraction model instead of analyzed | Anyone. Most likely on long sessions, sessions cut off by a usage limit, or sessions closed while the agent was working | That session saved **0 memories**, and `hook.log` still said `ok` |
| Extraction through the `claude` CLI sent Claude Code's own system prompt, tool list, MCP servers and CLAUDE.md with every call | Users without `ANTHROPIC_API_KEY` (the subscription path) | ~37k extra input tokens per extraction, on your subscription quota |
| Tool-call arguments, including whole files written or edited, were sent to the extractor untrimmed | Everyone | Up to two-thirds of each extraction call was file contents. Long sessions were cut to their last 60k tokens sooner, so earlier work was dropped |
| File summaries ran with no time limit after extraction | Sessions that touched many large files, with `file_gating` on (the default) | The hook hit its 90-second limit, and `index.md` and the post-compaction warm-start file were not written |

**Did this affect me?** Check `~/.somtum/hook.log` for `inserted=0` on sessions where you know real work happened, or for `post_session timed out`. Either one means some sessions were lost or only partly saved.

## Re-capturing lost sessions

Claude Code keeps transcripts in `~/.claude/projects/<your-project-path-with-dashes>/`. To run v3 extraction over a project's past sessions, from the project root:

```bash
for f in ~/.claude/projects/-Users-me-dev-my-project/*.jsonl; do
  printf '{"transcript_path":"%s","cwd":"%s","hook_event_name":"SessionEnd"}' "$f" "$PWD" \
    | somtum hook post_session
done
```

Each transcript costs one extraction call (up to 60k input tokens), so start with the sessions you care about. Sessions that were already captured will produce near-duplicates; Somtum marks the older one as superseded automatically.

## Breaking changes

- **`somtum doctor` check names.** `api_key` is now `extraction_backend`, and it reports which backend will run (`anthropic`, `claude-cli` or `codex-cli`). If a script reads `somtum doctor --json`, update the check name.
- **Extraction output differs.** The extraction prompt changed, and the model is now told the per-session cap (`extraction.max_observations_per_session`). Expect different, usually more, memories per session than v2 produced from the same transcript.
- **Log lines.** `ANTHROPIC_API_KEY not set — using claude CLI fallback` is replaced by `extraction backend: <name>`. Update anything that greps `hook.log`.

Your stored memories, config file and database are unchanged. No migration is needed.

## New in v3

- **Codex support:** `somtum init --agent codex`. Claude Code and Codex share one memory per project. See [Getting Started](/guide/getting-started), Step 1.
- **Extraction backends:** `extraction.backend` = `auto` (default), `anthropic`, `claude-cli` or `codex-cli`. GLM and other Anthropic-compatible providers work through `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`.
- **`doctor`** checks hooks for either agent.
