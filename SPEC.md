# Somtum Product-Hardening Spec

Status: living document · Owner: @riz007 · Applies from: v2.3.0 · Updated for 3.1.0

> Historical note: a few code comments reference sections of an earlier design
> spec (e.g. "SPEC.md §5.2" for memory markdown mirrors) that was never checked
> in. This document supersedes it. Section numbers below are the ones to
> reference going forward.

## 1. Mission

Somtum's job is to give Claude Code a **long-term memory that demonstrably
pays for itself**. Everything in this spec serves one of three goals:

1. **Correctness** — behave correctly against *real* Claude Code transcripts
   and *real* concurrent usage, not fixtures.
2. **Efficiency** — spend fewer tokens capturing memories than the memories
   save; keep the per-prompt hot path in single-digit milliseconds.
3. **Proof** — report *measured* impact, not modeled estimates. A skeptical
   user running `somtum stats` should see numbers Somtum can defend.

### The cost rule

Somtum spends tokens to save tokens, so it must never multiply a user's bill.
Every change is held to four invariants:

1. **Bounded.** Every token Somtum spends or adds to a prompt has a hard cap.
2. **Metered.** Every spend is written to the token ledger (`token_ledger`,
   `src/core/ledger.ts`) at the point it happens. No ledger row, no feature.
3. **Skipped when it can't pay.** Work below a useful size (tiny extraction
   deltas, irrelevant prompts) makes no model call and injects nothing.
4. **Opt-in unless it pays by default.** A feature whose payoff depends on
   usage patterns (file gating) ships off, and is metered on both sides so
   `somtum doctor` can tell the user to turn it off.

Public claims follow the same rule: README, docs and launch copy may only
quote metered numbers, and must label the one heuristic (`tokens_saved`) as an
estimate.

Non-goals: cloud sync beyond the existing SSH backend, team/multi-user
features. Agent support is in scope: one local memory shared by every
coding agent the user runs (see §11).

## 2. Baseline: shipped in v2.3.0

These landed together and are the floor this spec builds on. Recorded here
because they define assumptions later sections rely on.

| Fix | Where | Why it matters |
| --- | --- | --- |
| Tool-result user messages reclassified as `tool` turns; `isMeta`/`isSidechain` skipped; oversized tool results truncated; synthetic prompts (command wrappers, interruptions) excluded from cache keys | `src/core/transcript.ts` | Real transcripts deliver tool results as user-role messages; before this, ~95% of "user prompts" were tool results, cached responses were truncated at the first tool call, and the cache filled with garbage keys |
| Session-scoped injection dedup (per `session_id` state, reset after compaction warm-start) | `src/hooks/pre_prompt.ts` | Injected context persists in the session's window; re-injecting the same memory every prompt was pure token waste |
| `cache.ttl_days` / `cache.max_entries` enforced via `PromptCache.prune()` at session end | `src/core/cache.ts`, `src/hooks/post_session.ts` | Cache previously grew without bound; the config keys existed but were dead |
| Migration re-check under the write lock | `src/core/db.ts` | Two concurrent sessions opening a fresh DB crashed with `UNIQUE constraint failed: schema_migrations.version` |
| `--model` passed to the `claude -p` extraction fallback | `src/core/extractor.ts` | Fallback ran on the user's default model (often Opus, ~10× Haiku cost) |
| `SOMTUM_HOME` honored for session state, warm-start, `hook.log`, first-session flag; tests isolated from the real `~/.somtum` | hooks, `src/cli/hook.ts`, `vitest.config.ts` | The first-session flag was written to a different path than it was read from when `SOMTUM_HOME` was set |

Invariants established by the baseline — **do not regress**:

- A hook must never break or block a Claude Code session. Exit 0 on failure,
  timeout every external call, fail soft on unreadable state files.
- `parseTranscript` must be validated against a real `~/.claude/projects`
  JSONL whenever its behavior changes, not only against fixtures.
- Tests never touch the developer's real `~/.somtum`.

## 3. Workstream A — Incremental extraction (highest priority)

> **Status: shipped in 3.1.** `session_progress` guards on a hash of the whole
> extracted prefix rather than only the last turn: a rewrite that keeps the
> last turn in place would otherwise resume at the wrong point. Deltas under
> `extraction.min_new_tokens` (500) make no call and don't advance the cursor.
> Measured on three real sessions compacting once at 60%: 35–47% fewer
> extraction tokens.

**Problem.** `runPostSession` fires on both `SessionEnd` and `PreCompact` and
each run sends up to 60k tokens of transcript to Haiku with no memory of what
was already processed. A long session that compacts twice pays for extraction
three times, re-reading the same prefix. Dedup removes the duplicate
*observations* afterward, but the tokens are already spent. This is the
largest efficiency defect in the product.

**Design.**

- New table (migration `NNN_session_progress.sql`):

  ```sql
  CREATE TABLE session_progress (
    session_id       TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    turns_extracted  INTEGER NOT NULL,   -- count of parsed turns already sent
    last_turn_hash   TEXT NOT NULL,      -- sha256 of the last extracted turn's text
    updated_at       INTEGER NOT NULL
  );
  ```

- In `runPostSession`, after `parseTranscript`:
  1. Look up `session_progress` by `session_id`.
  2. If found **and** `turns[turns_extracted - 1]` hashes to `last_turn_hash`,
     extract only `turns.slice(turns_extracted)`. The hash guard detects
     transcript rewrites (e.g. resumed/forked sessions) — on mismatch, fall
     back to full extraction.
  3. After a successful extraction, upsert the row with the new turn count.
- If the delta is empty (SessionEnd immediately after PreCompact with no new
  turns), **skip the LLM call entirely** and return `inserted: 0`.
- Cache population and file summaries already dedupe by hash/upsert; they can
  keep consuming the full turn list.
- Eviction: delete `session_progress` rows older than 7 days during
  `post_session` (same pattern as warm-start eviction).

**Acceptance.**

- A transcript processed twice in a row costs one LLM call, not two
  (test with a counting fake `LlmCaller`).
- PreCompact → SessionEnd on a session with 3 new turns extracts only those
  turns (assert on the prompt passed to the fake caller).
- Hash mismatch falls back to full extraction.
- `somtum stats` gains an `extraction_calls_skipped` counter (see Workstream B).

## 4. Workstream B — Measured impact, not modeled estimates

> **Status: B2 and B3 shipped in 3.1** as an event ledger (`token_ledger`:
> extraction, extraction_skipped, file_summary, injection, file_gate_*),
> `somtum stats` (with `--since`), the MCP `stats` tool and `/api/stats/full`.
> `doctor` dropped the heuristic breakeven check for a metered overhead line.
> **B1 (memory false hits) and B4 (shadow mode) are open.**

**Problem.** `tokens_saved` (`estimateTokensSaved`) is
`transcriptTokens / N − observationTokens` — an assumption presented as
savings. Retrieval stats count *activity* (BM25 calls, cache hits), not
*impact*. The only closed-loop signal in the product is the cache false-hit
detector. Somtum asserts value; it should measure it.

**Design.**

1. **Memory false-hit detection** (mirror of the cache mechanism, same file):
   after injecting memories, record `{session_id, prompt_text, injected_ids,
   injected_at}` in the existing injection state file. On the next prompt, if
   word-overlap with the previous prompt is > 0.6 within 5 minutes — the user
   re-asked — increment `false_hit_count` on those observations (new column,
   default 0). Memories with `false_hit_count >= 3` are excluded from
   retrieval and flagged by `somtum doctor` for review.
2. **Ledger of measured token flows** — extend `retrieval_stats` (or a new
   `token_ledger` table) with columns Somtum can *actually measure*:
   - `injected_chars` / prompt (already computed in `buildMemoryContext`)
   - `extraction_input_tokens`, `extraction_output_tokens` (already returned
     by every `LlmCaller`)
   - `extraction_calls_skipped` (from Workstream A)
3. **Reframe `somtum stats`.** Lead with measured numbers: spend this week,
   injection volume, hit rates, top-confirmed memories
   (`last_confirmed_at`), memories flagged as false hits. Keep
   `tokens_saved` but label it in output as `estimated (heuristic)` — never
   present it as a measurement. README "Token Accounting" section updated to
   match.

4. **Shadow mode (control run).** `injection.mode: "shadow"` retrieves and
   meters what *would* have been injected without injecting it. A user can run
   a week in shadow and a week live and compare their own agent's spend from
   their agent's usage reporting. This is the only way to show Somtum's net
   effect on a real bill: the value of a memory never appears in a transcript.

**Acceptance.**

- Re-asking a near-identical prompt after an injection increments
  `false_hit_count` on exactly the injected observations; an unrelated next
  prompt does not.
- An observation crossing the false-hit threshold stops being retrieved and
  appears in `doctor` output.
- `somtum stats` output distinguishes measured vs. estimated numbers.

## 5. Workstream C — Retrieval quality

### 5.1 Rank-based cross-DB merge

`mergeResults` in `pre_prompt.ts` sorts raw BM25 scores from two different
FTS indexes (project DB and global DB). BM25 scores are corpus-relative and
not comparable across indexes. Replace score-sort with **reciprocal rank
fusion**: `score(d) = Σ 1 / (60 + rank_i(d))` across the result lists, then
take top-k. Keep `min_relevance_score` as a per-list filter *before* fusion,
since the config value is calibrated to raw BM25.

### 5.2 Body-aware dedup

`deduplicateObservations` compares titles only (Jaccard > 0.6). Two memories
titled "Fix auth token refresh" with contradictory bodies collide; distinct
learnings with similar titles get wrongly superseded. Add a second gate: when
titles match, require body word-overlap > 0.3 to supersede; otherwise keep
both. (Cheap, no LLM call — this stays in the SessionEnd budget.)

### 5.3 Stale-memory decay

Memories never expire; a decision superseded in reality but never re-stated
in a session lingers forever. Combine the existing signals — `created_at`,
`last_confirmed_at`, `false_hit_count` — into a retrieval-time demotion:
memories not confirmed in 90 days rank below fresh ones at equal BM25 score
(multiply fused score by a recency factor, floor 0.5). `somtum doctor`
already detects stale memories; wire the same definition here so the two
agree.

**Acceptance:** fusion ordering is deterministic under fixed inputs; a title
collision with divergent bodies no longer supersedes; a 6-month-unconfirmed
memory ranks below an equal-scoring fresh one.

## 6. Workstream D — Cache: reposition and bound

> **Status: D1 (docs) and D3 (dated framing) shipped in 3.1.** The docs no
> longer claim a cache hit "skips the model": it adds the earlier answer to
> the prompt. **D2 (bounded fuzzy scan) is open.**

**Problem.** Exact-hash prompt repeats are rare in real coding; the fuzzy
path is off by default; a stale cached response injected as "a previous
response addressed a matching prompt" can actively mislead. Meanwhile
`lookupFuzzy` decodes **every** stored embedding per lookup — ~15 MB scanned
per prompt at the 10k-entry cap.

**Design.**

1. **Reposition** (docs + defaults, no code removal): Somtum is a *memory*
   tool; the cache is a secondary accelerator. README leads with memory.
   `somtum init` continues to require the explicit `--cache` opt-in (already
   the case — keep it that way).
2. **Bound `lookupFuzzy`:** restrict candidates to the most recent
   `min(1000, max_entries)` non-invalidated entries by `last_hit_at`, and
   short-circuit at similarity ≥ 0.99. If embeddings ever default on, revisit
   with a proper ANN index; until then the cap is sufficient.
3. **Soften the injection framing** in the cache-hit context from "A previous
   response addressed a matching prompt" to explicitly dated language:
   "A response from <relative time> to a near-identical prompt — verify it
   still applies before reusing." Include the entry's age; the model treats
   stale data more skeptically when told it is stale.

**Acceptance:** fuzzy lookup touches at most 1000 rows (assert via a seeded
DB of 2000 entries); cache-hit context includes the entry age.

## 7. Workstream E — Hook robustness

- **Per-phase timeout budget.** `hook.ts` gives `post_session` 90s total, but
  extraction (60s CLI timeout) plus file summaries can exceed it; the race
  rejects while orphaned work continues and its results are lost. Split the
  budget: extraction ≤ 60s, then file summaries get whatever remains minus a
  5s reserve for index generation and warm-start. When the budget is
  exhausted, *skip* remaining phases cleanly (log `phase skipped: budget`)
  instead of racing the whole pipeline against one timer.
- **Cache-entry `model` field honesty.** `populateCache` stamps entries with
  `config.extraction.model` (Haiku), but the responses were produced by the
  session's main model. Stamp `unknown` (or parse the model from the
  transcript line metadata, which real JSONL includes) — the field feeds the
  dashboard and should not lie.
- **`hook.log` rotation.** Append-only with no cap; truncate to the last
  1 MB when it exceeds 5 MB, at `post_session` time.

**Acceptance:** a fake caller that sleeps past the extraction budget still
produces an index and warm-start; `hook.log` never exceeds 5 MB after a run.

## 8. Workstream F — Positioning and proof surface

> **Status: README, docs home page and "What Somtum Costs" page shipped in
> 3.1**, memory-first and quoting only metered numbers. `stats --weekly` is
> superseded by `stats --since 7d`. The shareable report is §12.

- README: retitle from "memory and prompt-cache layer" to memory-first
  framing; move cache to a secondary section; replace the "Token Accounting"
  claims with the measured-vs-estimated split from Workstream B.
- `somtum stats --weekly`: one-screen summary designed to be screenshot-able
  — measured extraction spend, injections, confirmed memories, flagged false
  hits. This is the marketing asset; it only works if the numbers are real.
- Docs page "How Somtum measures itself" describing the false-hit loop and
  the ledger, including its limits (proxy signals, not ground truth).

## 9. Sequencing and releases

| Release | Contents | Rationale |
| --- | --- | --- |
| 3.1.0 | A, B2–B3, D1, D3, F docs; file gating redesign; stopwords; `init` installs recall and creates the DB | Shipped. Stops Somtum multiplying cost and makes it measurable |
| 3.2.0 | B4 shadow mode, B1 memory false hits | Shadow mode is the proof users can check against their own bill |
| 3.3.0 | C (rank fusion, body-aware dedup, decay), D2 | Retrieval quality once impact is measurable |
| 3.4.0 | E, §12.2 `somtum report` | Hardening, then the shareable report built on real data |

Launch (§12.3) waits for 3.2: launch copy needs shadow-mode numbers.

Each workstream ships behind existing config where behavior changes
(`injection.*`, `cache.*`) and gets a changeset. Migrations are additive
only; no destructive schema changes without a `somtum rebuild` path.

## 10. Definition of "product, not demo"

Somtum graduates when all of these hold:

1. ✅ Processing the same session twice costs one extraction, not two (A).
2. ✅ `somtum stats` contains zero numbers Somtum cannot defend as measured,
   and clearly labels the one heuristic it keeps (B).
3. A memory that misleads the model twice stops being injected without the
   user editing anything (B1).
4. The hot path stays < 50 ms p95 with a 10k-entry cache and 5k memories
   (bench exists in `test/bench` — extend it to cover D2).
5. A new user can read the README and correctly predict what Somtum will
   and will not do for them (F).

## 11. Agent adapters

**Why.** Claude Code, Codex and Cursor each ship their own memory, scoped to
that one agent. A local store that every agent reads and writes is the part
none of them offer.

**Design.** An agent is a transcript format plus an install target.
`src/agents/` holds one adapter per agent (`detect`, `parse`, optional
`findTranscript`); `core/transcript.ts` dispatches to the first adapter whose
`detect` matches, with Claude Code as the fallback. Hook handlers are shared:
Codex hooks use the same `hooks.json` shape, event names, stdin payload and
`hookSpecificOutput.additionalContext` reply as Claude Code. Extraction is
agent-independent via `extraction.backend` (`anthropic`, which also covers
Anthropic-compatible providers such as GLM through `ANTHROPIC_BASE_URL` +
`ANTHROPIC_AUTH_TOKEN`; `claude-cli`; `codex-cli`).

**Shipped.**

| Agent | Capture | Injection | MCP | Install |
| --- | --- | --- | --- | --- |
| Claude Code | `SessionEnd`, `PreCompact` | `UserPromptSubmit` (opt-in via `--cache`) | `.mcp.json` | `somtum init` |
| Codex | `SessionEnd`, `PreCompact` | `UserPromptSubmit` (default) | `.codex/config.toml` | `somtum init --agent codex` |

Fixes found while validating against real transcripts, recorded so they are
not regressed:

- Tool-call inputs are truncated (300 chars) like tool results. Whole files
  inside `Write`/`Edit`/`apply_patch` arguments were 66% of extractor input.
- The transcript is wrapped in `<transcript>` tags and the task restated after
  it. Without that, a session ending mid-task was continued by the model
  (fake tool call, parse failure, empty retry) and silently lost.
- `claude -p` runs with `--system-prompt`, no tools, no MCP, no setting
  sources: ~37k tokens of Claude Code overhead per call otherwise.
- File summaries run last under a 55 s budget so the 90 s hook limit can't
  cost the index or warm-start file.

**Next.**

1. Cursor and Cline: MCP registration and their hook systems; transcripts
   only where the format is stable enough to parse.
2. `AGENTS.md` sync: write top memories into the file most agents already
   read, for agents with neither hooks nor MCP.
3. ✅ Decided in 3.1: `somtum init` installs `UserPromptSubmit` by default,
   matching Codex. `--no-cache` gives capture only.
4. The retry after a parse failure has no transcript, so it cannot recover a
   role-play reply. Either resend the transcript once or log the loss.

## 12. Growth plan, evaluated

The growth proposal (README demo, shareable session snapshots, launch on HN,
Reddit and Discord) is right that Somtum needs a visible proof surface. It is
held to the cost rule (§1): a launch that quotes numbers Somtum can't back up
costs more credibility than it earns. Each item below is accepted, rejected or
deferred.

### 12.1 Product requirements

| Proposal | Decision | Why / constraint |
| --- | --- | --- |
| Hybrid search (FTS5/BM25 + optional local embeddings) | Already shipped | Embeddings stay off by default: a 30 MB download and per-prompt CPU for a recall gain that only matters on paraphrased queries |
| Smart context pruning, token-weighted injection | Shipped in 3.1 | `injection.k`, `max_chars`, stopwords, once-per-session, all metered |
| Shell rc hooks (`.zshrc`/`.bashrc`) to watch sessions | **Rejected** | Agents have first-class hook systems. A shell hook can't see inside an agent session, slows every shell start, and fails silently |
| "Intercept input streams before they hit the API" | **Rejected as worded** | `UserPromptSubmit` already adds context per prompt. Proxying API traffic would handle credentials, and naive injection breaks the agent's prompt cache, which can cost more than memory saves |
| IDE sync extensions (Cursor, VS Code) | Deferred | MCP already reaches Cursor. Revisit with §11 Next #1 |
| `somtum share --session <id>` | Accepted as `somtum report` (§12.2) | Metered numbers only; never "money saved" from the heuristic |

### 12.2 `somtum report`

A local, shareable summary of what Somtum did over a window.

- `somtum report --since 7d [--format md|html]` writes to stdout or a file.
  Nothing is uploaded; sharing is the user's action.
- Contents: metered ledger totals, memories captured (titles only, redacted),
  injections, file-gating net, and shadow-mode comparison when available.
- Every number carries its kind (metered or estimated), as in `somtum stats`.
- Redaction reuses `privacy.redact_patterns`, plus project paths reduced to
  repo-relative form.
- Acceptance: a report generated from a seeded ledger matches `stats --json`
  exactly; a seeded secret in a memory title does not appear in the output.

### 12.3 Launch

- **README demo.** Record with a `vhs` tape checked into `assets/`, so it is
  reproducible. It shows a real session: the `[somtum] injected N/M memories`
  line, then `somtum stats`. No staged "cache hit fixed my deploy" scene unless
  it happened.
- **Copy.** Lead with the problem and the meter, not with savings. "How I
  stopped wasting $50/week" is rejected unless a shadow-mode run shows it. The
  working title is "What my coding agent's memory actually costs", built from
  the author's own `stats --since 30d`.
- **Order.** README and docs (shipped in 3.1), then Show HN once 3.2 has
  shadow-mode data, then r/ClaudeAI, r/LocalLLaMA and the Anthropic Discord
  with the same numbers.
- **Precedent.** The best-received Claude Code cost write-ups grouped real
  usage by call source, offered a pass-through control mode, and listed their
  own limits. Shadow mode (B4) and "What Somtum can't see" in the cost docs are
  Somtum's versions of those.

## 13. Branch-aware memory and backfill (3.2)

**Why.** A user asked what happens when two branches make conflicting
decisions. Through 3.1 the answer was: both are stored, both can be injected,
and a throwaway branch could supersede `main`'s decision if the titles were
close enough.

**Shipped.**

- `observations.git_branch`, `git_commit`, `git_before_first_commit`
  (migration 007). `src/core/git_context.ts` captures them and decides
  visibility; `src/core/recall_filter.ts` applies it to prompt injection, MCP
  `recall` and the warm-start file.
- Visibility: hidden only when the source branch exists, isn't the current or
  default branch, and isn't merged into HEAD. Deleted branches and branches
  whose upstream is gone count as merged: git can't detect squash merges, and
  a deleted branch was usually merged. Captures before a branch's first commit
  stay hidden until the branch is deleted, because git reports such a branch as
  merged from the start.
- Supersession is limited to the same branch (or branch-less memories from the
  default branch) and compares `created_at`. Conflicts between branches are
  settled at recall: newest of near-duplicates wins.
- `somtum backfill` for the cold-start problem: discovery of past Claude Code
  and Codex sessions, cost preview via the same `planExtraction` the hook uses.

**Known limits.** An abandoned branch that is deleted without
`somtum forget --branch` is indistinguishable from a merged one. A session that
switched branches is attributed to the branch it ended on.

**Next.**

1. `retrieval.rerank_model` is unused: hybrid is reciprocal rank fusion with no
   model call. Remove the key or implement the rerank.
2. Projects without a git remote are keyed by path, so a symlinked path is a
   different project. Fixing it changes existing project IDs and needs a
   migration path.
