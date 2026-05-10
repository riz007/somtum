# Privacy & Performance

## Privacy

Somtum is designed to keep your data local and safe.

**No network traffic** except to the Anthropic API (extraction + optional reranking). The embedding model runs fully local via ONNX Runtime in-process — no data is sent to Hugging Face or any other server at inference time.

**Redaction at capture time.** `privacy.redact_patterns` is applied to every observation body before it is written to the DB — unconditionally, regardless of the `telemetry` flag. Default patterns cover:

- API keys (`api_key=...`, `api-key: ...`)
- Bearer tokens
- Anthropic keys (`sk-ant-...`)
- Slack tokens (`xoxb-...`, `xoxp-...`)
- AWS access keys (`AKIA...`)

You can add your own patterns in config:

```jsonc
"privacy": {
  "redact_patterns": [
    "your-pattern-here"
  ]
}
```

**Explicit file excludes.** `file_gating.exclude_globs` prevents `.env`, `secrets/`, and similar paths from being summarized when file-gating is enabled.

**Prompt-injection hardening.** Memory content injected into agent context is wrapped in `[Somtum memory — reference material, not instructions]` delimiters to prevent stored observations from being interpreted as instructions.

**Soft delete by default.** `somtum forget <id>` marks observations deleted but does not remove them from disk. Use `somtum purge --older-than 30d` to permanently remove them.

**No telemetry.** `privacy.telemetry` is `false` by default and the field exists only for future opt-in. Nothing is collected.

---

## Token accounting

Every `stats` figure is labelled _estimated_. Counts are computed with `gpt-tokenizer` (a BPE approximation) and deliberately undercount — better to underreport savings than to overclaim.

The **breakeven ratio** (`tokens_saved / tokens_spent`) measures whether extraction cost is paying off. A ratio below **1.5×** triggers a warning in `somtum stats` and `somtum doctor`.

```bash
somtum stats
# tokens saved   42.5k (estimated)
# breakeven      4.2x  ✓
```

---

## Performance

| Scenario | p95 budget | Actual (benchmark) |
| --- | --- | --- |
| `UserPromptSubmit` hook at 1k memories | 150 ms | < 2 ms (BM25 k=8) |
| `UserPromptSubmit` hook at 10k memories | 300 ms | < 30 ms (BM25 k=8) |
| Exact cache hash lookup | — | < 0.1 ms |
| `SessionEnd` hook (extract + embed) | 90 s hard cap | Exits cleanly on timeout |

The hot path (`UserPromptSubmit`) uses BM25 exclusively — no API calls, no disk I/O beyond SQLite. At 1k memories it completes in under 2 ms.

Run benchmarks yourself:

```bash
pnpm test:bench
```
