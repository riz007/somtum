---
'somtum': minor
---

Meter every token Somtum spends, and stop spending where it can't pay off.

- **Incremental extraction.** A per-session cursor sends only turns not yet extracted, so a session that compacts and then ends is extracted once, not twice. Deltas under `extraction.min_new_tokens` (default 500) make no model call and are carried to the next extraction. On three real sessions that compacted once, extraction used 35–47% fewer tokens.
- **Token ledger.** Extraction, file summaries, injected context and file gating are recorded where they happen. `somtum stats` leads with these metered numbers (`--since 7d` for a window); the JSON adds a `ledger` object and keeps every existing field. The heuristic breakeven ratio is gone from the human output and from `somtum doctor`, which now reports metered overhead instead.
- **File gating redesigned, now opt-in.** The first whole-file `Read` of an unchanged, summarized file in a session is answered with the summary *instead* of the file. A second `Read` goes through. Previously the summary was added on top of the full read, so gating could only cost tokens. It is off by default: 3.0 generated file summaries at every session end even where the gating hook wasn't installed. `somtum init --file-gating` turns it on; `doctor` flags an installed hook that config has switched off, and warns when gating's metered net goes negative.
- **`somtum init` installs recall by default** (matching Codex) and creates the project database, so `somtum doctor` passes straight after init. `--no-cache` gives capture only.
- **Fewer irrelevant injections.** Common words are ignored when matching memories to a prompt.
- **Cached answers are labeled with their age** and framed as something to verify. The docs no longer claim a cache hit skips the model.
- New docs page, "What Somtum Costs", and a rewritten README and docs home page.
