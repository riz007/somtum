# What Somtum Costs

Somtum spends tokens to save tokens, so it has one design rule: it must never multiply your bill. Everything it spends is bounded, anything that can't reliably pay off is opt-in, and every token is written to a local ledger you can read with `somtum stats`.

This page covers where the tokens go, how to read the numbers, how to turn costs down, and what Somtum cannot measure.

## Where the tokens go

### Extraction

When a session ends or compacts, Somtum sends the conversation to a small model to pull out decisions, bug fixes and learnings.

- **Only new turns are sent.** Somtum keeps a cursor per session. A session that compacts and then ends is extracted in two parts, never twice. If the transcript was rewritten (a forked or edited session), the cursor no longer matches and Somtum falls back to a full extraction.
- **Small deltas are skipped.** If there are fewer than `extraction.min_new_tokens` new tokens (default 500), no model call is made. The turns stay unextracted and are sent with the session's next extraction. A session that *ends* with fewer than 500 unextracted tokens is not extracted at all: that's usually a greeting or a one-line question, and the extraction prompt alone would cost more.
- **Bulk is trimmed.** Tool results are cut to 1,000 characters and tool-call arguments (whole files inside edits, for example) to 300. Anything over 60,000 tokens keeps the most recent part.
- **Retries are cheap.** If the model returns malformed JSON, the one retry sends only the bad output and the error, not the transcript.

Who pays depends on the backend. The Anthropic API bills per token at Haiku rates. The `claude` and `codex` CLIs draw on your existing subscription's usage.

**Measured.** Three real Claude Code sessions replayed through the pipeline with a stub model, each compacting once at 60% of its length:

| Session | Turns | Through v3.0 | v3.1 | Saved |
| --- | ---: | ---: | ---: | ---: |
| Web app redesign | 309 | 64,577 | 41,756 | 35% |
| API service | 36 | 47,892 | 25,498 | 47% |
| Course assignment | 132 | 21,966 | 13,029 | 41% |

Tokens are counted over the exact extraction requests, system prompt included, with the same tokenizer approximation `somtum stats` uses. Sessions that never compact cost the same as before.

### Injected memories

On each prompt, Somtum searches your memories locally (SQLite FTS5, no network) and adds the best matches to the agent's context.

- **Bounded.** At most `injection.k` memories (3) and `injection.max_chars` characters (1,500, about 375 tokens), plus a one-line header saying how much was injected. Turn the header off with `injection.show_budget false`.
- **Only when relevant.** Common words like "the", "how" or "this" are ignored, and for prompts of three or more words a memory must share at least two of them (`injection.min_matched_terms`). Word endings are normalized, so "installed" matches "install". One shared word is too weak a signal: in a small project nearly every memory mentions the project's main nouns. No match, nothing added.
- **Once per session.** A memory already injected in a session isn't sent again. After a compaction, which wipes the context, memories can be injected again.

This text goes into your agent's prompt, so your agent's model pays for it at its input price. It's the cost of the memory actually being used, and it's metered as *injected context*.

### Prompt cache

When a prompt exactly matches an earlier one and the files the earlier answer touched haven't changed, Somtum adds that answer to the context, marked with its age. This does **not** skip the model call. It adds up to 6,000 characters, so the agent can reuse the answer instead of redoing the work. Exact repeats are rare, and the hit rate is in `somtum stats`. Turn it off with `somtum config set cache.enabled false`.

### File summaries and file gating (opt-in, Claude Code)

File gating is off by default. Turn it on with `somtum init --file-gating`.

- **Summaries.** After extraction, Somtum asks the small model for a short summary of each large file (300+ tokens) the session touched and changed since its last summary. These calls run last, within a 55-second budget.
- **Gating.** The first time the agent asks to read a whole summarized file in a session, and the file hasn't changed, Somtum answers with the summary instead. If the agent needs the actual contents, it reads the file again and that read goes through. Reads with an offset or limit, and files matching `file_gating.exclude_globs`, are never gated.

The trade-off: when the summary is enough, a full read is saved. When it isn't, the agent spends an extra tool call and still reads the file. Somtum meters both outcomes, and after 10 gated reads `somtum doctor` warns you if the net is negative.

## Reading `somtum stats`

```
Somtum's own token use, metered (all time)
  extraction            4 calls     54,785 tok   1 skipped
  file summaries        6 calls      9,120 tok
  injected context   14 prompts      4,060 tok   added to your agent's input
  total                             67,965 tok

File gating, metered (all time)
  full reads avoided          9     41,300 tok
  summaries shown             9     -1,899 tok
  read anyway                 2     -8,200 tok
  net                               31,201 tok   saved
```

The *File gating* block only appears once gating has done something.

- **extraction**: model calls made and their tokens. *skipped* counts extractions that made no call because there wasn't enough new material.
- **injected context**: prompts Somtum added memories or cached answers to, and the total tokens added.
- **full reads avoided**: whole-file reads answered with a summary, counted at the file's full size.
- **read anyway**: of those, files the agent read anyway, also at full size.
- **net**: avoided, minus summaries shown, minus read anyway.

`somtum stats --since 7d` limits the metered numbers to a window. `somtum stats --json` includes everything under `ledger`.

## Metered vs estimated

| Number | Where it comes from | Kind |
| --- | --- | --- |
| Extraction tokens | API-reported usage on the Anthropic backend; tokenizer count of request and response on CLI backends | Metered |
| Injected context | Tokenizer count of the exact text added to the prompt | Metered |
| File gating | File and summary sizes at the moment of each decision | Metered |
| "Tokens of context replaced by memories" | Each memory credited with a share of the transcript it came from | Estimate |

Tokenizer counts are an approximation of your model's tokenizer. Treat them as close, not exact.

The last row is shown at the bottom of `somtum stats` and labeled as an estimate. It's there because the real value of a memory can't be measured from the inside (see below), not because it's accurate.

## What Somtum can't see

- **The value of remembering.** When the agent already knows you use pnpm, the correction you didn't have to type and the wrong fix it didn't try never appear in any log. Somtum can show what memory costs. Whether it was worth it is your call.
- **Calls outside the transcript.** Somtum reads session transcripts, so it can't see model calls your agent makes that never appear in them. For whole-agent spend, use your agent's own usage reporting, such as Claude Code's OpenTelemetry export.

## Turning costs down

```bash
somtum config set extraction.min_new_tokens 1500           # extract only bigger chunks
somtum config set extraction.max_observations_per_session 5
somtum config set injection.k 2                            # fewer memories per prompt
somtum config set injection.max_chars 800                  # smaller injections
somtum config set injection.show_budget false              # drop the header line
somtum config set cache.enabled false                      # no cached answers
somtum config set file_gating.enabled false                # no summaries, no gating
```

To keep capturing but stop injecting (memories stay available through the MCP `recall` tool):

```bash
somtum config set injection.enabled false
```
