# Getting Started

## Requirements

- **Node.js 20+**
- **Claude Code** — Somtum hooks into Claude Code's `SessionEnd`, `UserPromptSubmit`, and `PreToolUse` events
- **`ANTHROPIC_API_KEY`** _(optional)_ — if set, Somtum calls the Anthropic API directly for extraction. Without it, Somtum falls back to the `claude` CLI that ships with Claude Code, so **no separate API key is required for Claude Code subscribers**.

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

### Step 1 — Choose an extraction backend

Somtum calls a Claude model at session end to extract observations. Pick one:

**Option A: Claude Code subscription (no extra setup)**

If you have Claude Code installed, you're done. Somtum calls `claude --print` automatically when no API key is present. Skip to Step 2.

**Option B: Direct Anthropic API key (optional — faster, lets you pick the model)**

```bash
# Add to ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

::: warning
The key must be in your shell profile, not just exported in an open terminal tab. The `SessionEnd` hook inherits the environment of the shell that *started* Claude Code.
:::

### Step 2 — Initialize in your project

Run from the **root of the project you work on with Claude Code**:

```bash
somtum init
```

To enable all features at once (recommended):

```bash
somtum init --all
# Installs:
#   - SessionEnd capture hook      (memory extraction)
#   - UserPromptSubmit cache hook  (prompt cache + auto-inject)
#   - PreToolUse file-gating hook  (large file summarization)
#   - MCP server in .mcp.json     (Claude can call recall/remember tools)
```

### Step 3 — Work normally

Open Claude Code from the same directory where you ran `somtum init`. Work as usual. When the session ends, the hook extracts observations automatically in the background (capped at 90 seconds).

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

### Step 5 — Diagnose issues

```bash
somtum doctor
```

This checks your API key, DB health, hook installation, migrations, cache, and breakeven ratio — with specific fix instructions for each failing check.

---

## Verifying the setup

After your first Claude Code session ends:

**1. Check the hook log**

```bash
cat ~/.somtum/hook.log
```

A successful run:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

Using the `claude` CLI fallback (no API key):
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
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

All checks should show `✓`. The `api_key` and `hooks_installed` checks are the most commonly failing.
