# Troubleshooting

## Somtum is spending more tokens than expected

Start with the metered numbers:

```bash
somtum stats --since 7d
```

- **Extraction is high.** Long sessions produce long transcripts. Raise `extraction.min_new_tokens` to extract only bigger chunks, and use the `claude` or `codex` CLI backend so extraction runs on your subscription instead of API credits.
- **Injected context is high.** Lower `injection.k` or `injection.max_chars`, or set `injection.show_budget false`.
- **File summaries are high, or file gating shows a negative net.** Turn it off: `somtum config set file_gating.enabled false`. `somtum doctor` flags this automatically after 10 gated reads.

Also check `doctor` for an `embeddings` problem: `strategy=hybrid` needs embeddings enabled and `@xenova/transformers` installed, and falls back to BM25 without them. To stay on BM25:

```bash
somtum config set retrieval.strategy bm25
```

See [What Somtum Costs](/guide/costs) for how each number is measured.

---

## `somtum stats` shows `memories 0` after a session

Check the hook log first:

```bash
cat ~/.somtum/hook.log
```

**No extraction backend**

The log shows `No extraction backend: set ANTHROPIC_API_KEY ...`.

- Claude Code users: run `which claude`. If nothing prints, reinstall Claude Code or add its binary to your `PATH`.
- Codex users: run `which codex`. The Codex desktop app doesn't always put the CLI on your `PATH`; install the CLI if it's missing.
- API users: add `export ANTHROPIC_API_KEY="sk-ant-..."` (or `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`) to `~/.zshrc` and run `source ~/.zshrc`. It must be in your profile, not just exported in the current terminal tab.

Run `somtum doctor`: the `extraction_backend` check shows which backend will be used.

**Hook not installed in the right directory**

`somtum init` writes hooks into the directory where you ran it: `.claude/settings.json` for Claude Code, `.codex/hooks.json` for Codex. If you launch the agent from a different directory, it reads different settings.

Fix: run `somtum init` from the same directory you launch the agent from.

```bash
cd ~/my-project
somtum init                  # Claude Code
somtum init --agent codex    # Codex
claude   # or: codex — launched from ~/my-project
```

**Codex hooks don't fire**

- Codex loads `.codex/hooks.json` and `.codex/config.toml` only for trusted projects. Trust the project when Codex asks, or add it under `[projects]` in `~/.codex/config.toml`.
- Hooks can be turned off with `[features] hooks = false` (or the older `codex_hooks`) in your Codex config. Check that neither is set to `false`.

**Short or trivial session**

If the session had no decisions, bug fixes, or learnings (e.g. you just asked the agent to say hello), the extractor correctly returns 0 observations.

**Long session that ended mid-task (v2.x only)**

Before v3, a session that ended while the agent was still working could be continued by the extraction model instead of analyzed. Those sessions were saved as 0 memories, with `ok` in the log. Upgrade to v3; old sessions can be re-captured by piping their transcript into `somtum hook post_session` (see [Upgrading to v3](/guide/upgrading-v3)).

---

## `somtum serve` opens the browser but shows "Connection refused"

This was a bug fixed in v1.1.0. Upgrade:

```bash
npm install -g somtum@latest
```

If you installed from source, rebuild:

```bash
pnpm build
```

---

## `somtum serve` — port already in use

```bash
somtum serve --port 3001
```

---

## Agent appears to keep running after session ends

The `SessionEnd` hook has a hard 90-second timeout. If sessions appear stuck, verify you are on v1.1.0+:

```bash
somtum --version
tail -20 ~/.somtum/hook.log
```

---

## Installation fails (node-gyp / better-sqlite3)

Ensure build tools are installed:

- **macOS:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
- **Windows:** `npm install --global --production windows-build-tools`

---

## Embeddings are slow or the model won't download

The first `somtum reindex` downloads a ~30 MB ONNX model from Hugging Face. This requires internet access. Subsequent runs use the cached model.

On an air-gapped machine or if you prefer not to use embeddings:

```bash
somtum config set retrieval.embeddings.enabled false
somtum config set retrieval.strategy bm25
```

BM25 works fully offline and is fast at any corpus size.

---

## The agent doesn't have context from previous sessions

**Auto-inject is the first thing to check.** Somtum injects relevant memories on `UserPromptSubmit` — no manual recall step needed.

1. Confirm the recall hook is installed: `somtum doctor` → look for `hooks_installed ✓`
2. If not installed: `somtum init` (Claude Code) or `somtum init --agent codex`. Projects set up with v3.0's plain `somtum init` have capture hooks only; run it again to add recall.
3. Confirm injection is enabled: `somtum config get injection.enabled` → should be `true`
4. Check that memories actually exist: `somtum stats` → `memories > 0`
5. Look for the budget line at the top of each prompt context: `[somtum] injected N/M memories (~X tokens)`. If there's no budget line, nothing matched: common words like "how" or "this" don't count, so a prompt has to share a real term with a memory. A memory is also not injected again later in the same session.

**Using the MCP server**, the agent can also call `recall` directly when uncertain. If it's not happening:

1. Confirm the server is registered: `cat .mcp.json` (Claude Code) or look for `[mcp_servers.somtum]` in `.codex/config.toml` (Codex)
2. Restart the agent to pick up the MCP config

---

## Stale memory warning in `somtum doctor`

`doctor` warns when memories are older than 90 days with no confirmed retrievals — observations that have never come up in a search. Options:

```bash
# Review them before deciding
somtum search "old topic"

# Promote useful ones to workspace scope
remember("...", scope="workspace")

# Remove irrelevant ones
somtum purge --older-than 90d
```

---

## Starting fresh — wiping all memories

To hard-reset a project's memory (irreversible):

```bash
somtum reset
# Permanently delete all memories for this project? [y/N] y
```

To soft-delete everything (recoverable via `somtum export --include-deleted`):

```bash
somtum forget --all
```
