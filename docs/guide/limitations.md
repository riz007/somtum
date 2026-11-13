# Limitations

Somtum is production-ready, but it has real trade-offs worth knowing before you commit to it. This page covers what it doesn't do well — and what to do about each.

---

## Value is front-loaded toward long-lived projects

**The problem:** On a fresh project, Somtum spends tokens on extraction before it has many memories to hand back, so early on you're mostly paying in. Memory pays off on projects you return to over weeks, not on one you started yesterday.

**What to do:**
- Check what it actually cost with `somtum stats` — the numbers are metered, not estimated. See [What Somtum Costs](/guide/costs).
- Lower `injection.k` to `1` or `2` on early-stage projects, or raise `extraction.min_new_tokens` to extract only bigger chunks.

---

## BM25 can't find semantically similar memories

**The problem:** The default retrieval is BM25, keyword matching over SQLite FTS5. It's fast and offline, but purely lexical: a memory titled _"migrated from Jest to Vitest"_ will **not** surface when you ask _"why did we switch test runners?"_, because no words overlap. Automatic recall on each prompt always uses BM25, to stay fast.

**What to do:** for `somtum search` and the MCP `recall` tool, install the embedding library and switch on hybrid retrieval, which fuses keyword and embedding rankings (reciprocal rank fusion, no model call):

```bash
npm install -g @xenova/transformers   # optional dependency, ~250 MB of native code
somtum config set retrieval.embeddings.enabled true
somtum reindex                        # downloads a ~30 MB model once
somtum config set retrieval.strategy hybrid
```

If the library isn't installed, these strategies fall back to BM25, `somtum search` says so, and `somtum doctor` shows the install command.

The `index` strategy is the other option: Haiku reads the memory catalog and picks relevant IDs. It costs one model call per query and needs `ANTHROPIC_API_KEY`:

```bash
somtum config set retrieval.index.enabled true
somtum config set retrieval.strategy index
```

---

## Extraction quality depends on session substance

**The problem:** The extractor only keeps durable observations — decisions, bug fixes, learnings, significant commands. A session where you asked Claude to explain a concept, wrote some boilerplate, or had a short conversation will correctly return 0 observations. This can feel like a bug when you expect something to be saved.

**What to do:**
- Check `~/.somtum/hook.log` — if it shows `inserted=0`, the session was likely too shallow to extract from.
- For things you _know_ you want saved, use `remember` via the MCP tool or `somtum remember` from the CLI. Don't rely solely on automatic extraction for important decisions.
- Sessions covering architecture decisions, debugging sessions, or significant refactors are where automatic extraction shines.

---

## No Windows-native testing

**The problem:** Somtum's hook pipeline has been tested and developed primarily on macOS and Linux. The hooks depend on Claude Code's and Codex's `SessionEnd`, `UserPromptSubmit` and `PreCompact` events, and the path handling, shell environment inheritance, and `better-sqlite3` native builds haven't been verified exhaustively on Windows.

**Known issues:**
- `better-sqlite3` may require `windows-build-tools` on some Windows setups (see [Troubleshooting](/troubleshooting#installation-fails-node-gyp--better-sqlite3)).
- Shell profile inheritance (for `ANTHROPIC_API_KEY`) behaves differently on Windows than on Unix.

**What to do:** If you're on Windows and hit issues, use WSL2 — it's the supported path for Windows developers.

---

## Somtum complements CLAUDE.md and AGENTS.md — it doesn't replace them

**The problem:** Somtum captures _accumulated experience_ from sessions — it's observation-driven. CLAUDE.md (Claude Code) and AGENTS.md (Codex) are _authored intent_ — things you want the agent to always know, written and maintained by you. They serve different purposes.

Relying on Somtum alone to keep the agent informed about critical project rules is risky. Somtum retrieves based on relevance to the current prompt; a rule that doesn't match the BM25 query won't be injected.

**What to do:**
- Use `somtum suggest-claude-md` to promote high-signal observations from Somtum into CLAUDE.md — this is the designed workflow.
- Keep permanent rules (team conventions, project architecture constraints, non-negotiables) in CLAUDE.md or AGENTS.md. The suggestions `suggest-claude-md` prints work in either file.
- Let Somtum handle the long tail: past bugs, specific decisions, one-off learnings.

---

## Memory grows without periodic pruning

**The problem:** Deduplication (M10) handles near-duplicate observations from session to session. But it can't remove memories that are simply no longer relevant — a file you deleted, a library you replaced, a decision you reversed.

Over months on an active project, the corpus can grow to hundreds of observations. BM25 retrieval stays fast (< 2ms at 1k memories), but injection quality degrades when stale memories are injected alongside fresh ones.

**What to do:**
```bash
# See what Somtum remembers about an old topic before deciding
somtum search "old library name"

# Soft-delete specific entries
somtum forget <id>

# Doctor warns about memories older than 90 days with no retrievals
somtum doctor

# Hard-remove soft-deleted entries older than 60 days
somtum purge --older-than 60d
```

Consider a monthly pruning pass on long-lived projects.

---

## Branch awareness relies on how branches end

**The problem:** Somtum can't tell an abandoned branch from a merged one once the branch is gone. A branch that was deleted (locally, or upstream after a pull request) is treated as merged and its memories become visible everywhere, because that is what usually happened. It also only knows the branch a session ended on, so a session that switched branches midway is attributed to the last one.

**What to do:** before deleting a branch you abandoned, drop its memories:

```bash
somtum forget --branch experiment/redux
```

---

## The extraction cost is real

**The problem:** Each session end or compaction can trigger an extraction call of up to 60k tokens. Since v3.1 only turns not yet extracted are sent, and nothing is sent when there are fewer than 500 new tokens, but a long session is still a long transcript.

**What to do:**
- On a Claude Code or Codex subscription, leave `ANTHROPIC_API_KEY` unset. Extraction then runs through the `claude` or `codex` CLI on your plan's quota rather than API credits.
- Raise `extraction.min_new_tokens` or lower `extraction.max_observations_per_session` to extract less.
- Check `somtum stats` for the metered extraction spend. See [What Somtum Costs](/guide/costs).
