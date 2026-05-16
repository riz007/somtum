# Getting Started

## Before you begin — pick your setup

**Using Claude Code (subscription)?**
You do not need an API key. Somtum calls the `claude` CLI that ships with Claude Code.
Confirm it is installed:

```bash
which claude
```

If nothing prints, reinstall Claude Code or add its binary to your PATH.

**Using the Anthropic API directly?**
Add your key to your shell profile (not just the current terminal tab):

```bash
# Add to ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

Both paths work. Most Claude Code users should use Option A.

---

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

### Step 1 — Initialize in your project

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

### Step 2 — Verify your setup

Run doctor immediately after init to confirm everything is connected:

```bash
somtum doctor
```

All checks should show a checkmark. The two most important are:

- **`api_key`** — confirms Somtum has a way to call Claude for extraction
- **`hooks_installed`** — confirms the SessionEnd and cache hooks are registered

::: warning
Do not proceed to Step 3 until all checks pass. Fix any failing checks now — troubleshooting after a session is harder.
:::

Each failing check now shows an inline fix command. For example:

```
✗  api_key                Neither ANTHROPIC_API_KEY nor claude CLI available — extraction will fail
               Fix A (Claude Code): which claude
               Fix B (API key):     export ANTHROPIC_API_KEY="sk-ant-..." >> ~/.zshrc && source ~/.zshrc
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
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 superseded=1 cache=2 summaries=1
```

The `superseded=N` field shows how many older near-duplicate memories were marked superseded by newly extracted ones.

Using the `claude` CLI fallback (no API key):
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 superseded=1 cache=2 summaries=1
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
