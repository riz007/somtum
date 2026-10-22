# Getting Started

Somtum works with **Claude Code** and **Codex**. Both agents share one memory per project, so you can install it for either or both.

## Before you begin — pick an extraction backend

At the end of each session Somtum asks a small model to pull out what's worth remembering. It picks the first backend that's available, so most people need to do nothing:

| You have | Backend used | Extra setup |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` in your shell profile | Anthropic API (Haiku) | none |
| `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (GLM or another Anthropic-compatible provider) | that provider | none |
| Claude Code installed (`which claude` prints a path) | `claude` CLI, on your subscription | none |
| Codex installed (`which codex` prints a path) | `codex` CLI, on your ChatGPT plan | none |

Keys must be in `~/.zshrc` or `~/.bashrc`, not just exported in one terminal tab. Hooks run as subprocesses and won't see them otherwise.

To pin a backend instead of auto-detecting:

```bash
somtum config set extraction.backend codex-cli   # or: anthropic, claude-cli, auto
```

---

## Requirements

- **Node.js 20+**
- **Claude Code or Codex** — Somtum uses their `SessionEnd`, `PreCompact` and `UserPromptSubmit` hooks
- **One extraction backend** from the table above. Claude Code and Codex subscribers need no separate API key.

## Install

```bash
npm install -g somtum
```

::: tip Package manager notes
**pnpm users:** `pnpm add -g somtum` works if you have run `pnpm setup` first. If not, use npm.

**yarn users:** `yarn global add` is not supported in Yarn v2+ (Berry). Use npm.
:::

### Install from source

```bash
git clone https://github.com/riz007/somtum
cd somtum
pnpm install
pnpm build
pnpm link --global
```

### Native module note

Somtum uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), which includes a native C++ addon. On most platforms (macOS, Linux x64/arm64, Windows x64) a prebuilt binary is downloaded automatically. On Alpine Linux / musl or unusual architectures, the addon compiles from source — `python`, `make`, and `gcc` must be available.

---

## Quickstart

### Step 1 — Initialize in your project

Run from the **root of the project you open in your agent**.

**Claude Code**

```bash
somtum init --all
# Installs:
#   - SessionEnd + PreCompact capture hooks  (memory extraction)
#   - UserPromptSubmit hook                  (auto-inject + prompt cache)
#   - PreToolUse file-gating hook            (large file summarization)
#   - MCP server in .mcp.json                (recall/remember tools)
```

::: tip Use --all
A plain `somtum init` installs only the capture hooks. Memories are then saved but not injected into your prompts, and the agent sees them only if it calls the MCP `recall` tool.
:::

**Codex**

```bash
somtum init --agent codex
# Installs:
#   - .codex/hooks.json   SessionEnd + PreCompact capture, UserPromptSubmit auto-inject
#   - .codex/config.toml  [mcp_servers.somtum]
```

Codex loads project-level config only for projects you've marked as trusted. Sessions are read from `~/.codex/sessions` (or `$CODEX_HOME/sessions`).

Using both agents on the same project? Run both commands. They write to different files and share one memory store.

### Step 2 — Verify your setup

Run doctor immediately after init to confirm everything is connected:

```bash
somtum doctor
```

All checks should show a checkmark. The two most important are:

- **`extraction_backend`** — confirms Somtum has a model to extract memories with
- **`hooks_installed`** — confirms hooks are registered for Claude Code, Codex, or both

::: warning
Do not proceed to Step 3 until all checks pass. Fix any failing checks now — troubleshooting after a session is harder.
:::

Each failing check now shows an inline fix command. For example:

```
✗  extraction_backend     none available — extraction will fail
               Claude Code: which claude   (reinstall or add it to PATH if nothing prints)
               Codex:       which codex
               API key:     export ANTHROPIC_API_KEY="sk-ant-..." >> ~/.zshrc && source ~/.zshrc
```

### Step 3 — Work normally

Open Claude Code or Codex from the same directory where you ran `somtum init`. Work as usual. When the session ends, the hook extracts observations automatically in the background (capped at 90 seconds).

### Step 4 — Check your memory

```bash
# How many observations were captured?
somtum stats

# Search memory
somtum search "auth jwt rotation"
somtum search "why we use pnpm" --strategy hybrid

# Open the visual dashboard
somtum serve
```

If `somtum stats` shows `memories 0` after a session, see [Troubleshooting](/troubleshooting).

---

## Verifying the setup

After your first session ends:

**1. Check the hook log**

```bash
cat ~/.somtum/hook.log
```

A successful run:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 superseded=1 cache=2 summaries=1
```

The `superseded=N` field shows how many older near-duplicate memories were marked superseded by newly extracted ones.

Each run also logs which backend it used:
```
2026-04-30T10:15:42.124Z [post_session] extraction backend: claude-cli
```

**2. Check stats**

```bash
somtum stats
```

You should see `memories > 0` after a substantive session. Short or trivial sessions (no decisions, no bug fixes) correctly return 0 — the extractor only stores durable observations.

**3. Run doctor**

```bash
somtum doctor
```

All checks should show `✓`. The `extraction_backend` and `hooks_installed` checks are the most commonly failing.
