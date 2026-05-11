# Limitations

Somtum is production-ready, but it has real trade-offs worth knowing before you commit to it. This page covers what it doesn't do well — and what to do about each.

---

## Value is front-loaded toward long-lived projects

**The problem:** On a fresh project with fewer than ~20 memories, `somtum stats` will often show a breakeven ratio below 1.5×. The token cost of injection (reading and sending memories to Claude on every prompt) can exceed the tokens saved until the memory store is large enough to pay off.

**What to expect:** The ratio improves naturally over weeks as memories accumulate and get retrieved more frequently. A project you've been working on for a month with 50+ memories will see consistent savings. A project you started yesterday won't.

**What to do:**
- Don't panic if `somtum doctor` warns about breakeven on a new project — it's expected.
- Lower `injection.k` to `1` or `2` on early-stage projects to reduce overhead.
- Run `somtum stats` after a month and compare.

---

## BM25 can't find semantically similar memories

**The problem:** The default retrieval strategy is BM25 — keyword matching over SQLite FTS5. It's fast and offline, but it's purely lexical. A memory titled _"migrated from Jest to Vitest"_ will **not** surface when you ask _"why did we switch test runners?"_ because no words overlap.

**What to do:**

Enable hybrid retrieval (BM25 + embeddings + Haiku rerank):

```bash
somtum config set retrieval.embeddings.enabled true
somtum reindex   # downloads ~30 MB ONNX model once
somtum config set retrieval.strategy hybrid
```

If you don't want the model download, the `index` strategy uses Haiku to read the memory catalog and pick relevant IDs — slower but semantic:

```bash
somtum config set retrieval.strategy index
```

::: warning Hybrid requires embeddings enabled
Setting `strategy=hybrid` without enabling embeddings causes a silent fallback to BM25 while paying hybrid overhead. Run `somtum doctor` to catch this.
:::

---

## Extraction quality depends on session substance

**The problem:** The extractor only keeps durable observations — decisions, bug fixes, learnings, significant commands. A session where you asked Claude to explain a concept, wrote some boilerplate, or had a short conversation will correctly return 0 observations. This can feel like a bug when you expect something to be saved.

**What to do:**
- Check `~/.somtum/hook.log` — if it shows `inserted=0`, the session was likely too shallow to extract from.
- For things you _know_ you want saved, use `remember` via the MCP tool or `somtum remember` from the CLI. Don't rely solely on automatic extraction for important decisions.
- Sessions covering architecture decisions, debugging sessions, or significant refactors are where automatic extraction shines.

---

## No Windows-native testing

**The problem:** Somtum's hook pipeline has been tested and developed primarily on macOS and Linux. The hooks depend on Claude Code's `SessionEnd`, `UserPromptSubmit`, and `PreToolUse` event system, and the path handling, shell environment inheritance, and `better-sqlite3` native builds haven't been verified exhaustively on Windows.

**Known issues:**
- `better-sqlite3` may require `windows-build-tools` on some Windows setups (see [Troubleshooting](/troubleshooting#installation-fails-node-gyp--better-sqlite3)).
- Shell profile inheritance (for `ANTHROPIC_API_KEY`) behaves differently on Windows than on Unix.

**What to do:** If you're on Windows and hit issues, use WSL2 — it's the supported path for Windows developers.

---

## Somtum complements CLAUDE.md — it doesn't replace it

**The problem:** Somtum captures _accumulated experience_ from sessions — it's observation-driven. CLAUDE.md is _authored intent_ — things you want Claude to always know, written and maintained by you. They serve different purposes.

Relying on Somtum alone to keep Claude informed about critical project rules is risky. Somtum retrieves based on relevance to the current prompt; a rule that doesn't match the BM25 query won't be injected.

**What to do:**
- Use `somtum suggest-claude-md` to promote high-signal observations from Somtum into CLAUDE.md — this is the designed workflow.
- Keep permanent rules (team conventions, project architecture constraints, non-negotiables) in CLAUDE.md.
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

## The extraction cost is real

**The problem:** Every session end triggers a Claude Haiku call to extract observations (unless the session is trivially short). On the Anthropic API, this is a real cost — typically a few hundred to a few thousand input tokens per session. Somtum tracks this in `tokens_spent` and shows the breakeven ratio.

**What to do:**
- Use `ANTHROPIC_API_KEY` unset + `claude` CLI fallback if you're on a Claude Code subscription — extraction then uses your subscription quota rather than API credits.
- Reduce `extraction.max_observations_per_session` if you're generating too many low-quality observations per session.
- Run `somtum stats` regularly to check whether savings are outpacing spend.
