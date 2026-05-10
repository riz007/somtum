# অবদান

অবদান স্বাগত! এই পৃষ্ঠায় ডেভেলপমেন্ট সেটআপ, প্রজেক্ট লেআউট এবং নতুন ফিচার যোগ করার পদ্ধতি কভার করা হয়েছে।

::: tip Changeset প্রয়োজন
প্রতিটি PR-এ `pnpm changeset` রান করে তৈরি একটি changeset ফাইল অন্তর্ভুক্ত থাকতে হবে। সম্পূর্ণ গাইডের জন্য [CONTRIBUTING.md](https://github.com/riz007/somtum/blob/main/CONTRIBUTING.md) দেখুন।
:::

## ডেভেলপমেন্ট সেটআপ

```bash
pnpm install
pnpm typecheck        # কঠোর TypeScript পরীক্ষা
pnpm test             # vitest unit + golden tests
pnpm test:golden      # কৌশল প্রতি retrieval recall@k
pnpm test:bench       # hot-path latency বেঞ্চমার্ক
pnpm lint             # eslint
pnpm fmt              # prettier
pnpm build            # tsc + copy migrations + copy dashboard → dist/
```

### লোকাল বিল্ড থেকে গ্লোবাল বাইনারি পুনরায় ইনস্টল করা

সোর্স পরিবর্তন করার পরে:

```bash
pnpm build
npm install -g .      # প্রজেক্ট root থেকে রান করুন
```

এটি বিশ্বব্যাপী ইনস্টল করা কপিটি আপনার স্থানীয় `dist/` দিয়ে প্রতিস্থাপন করে।

---

## প্রজেক্ট লেআউট

```
src/
  cli/
    index.ts            # commander CLI entry point
    init.ts             # somtum init — installs hooks + MCP config
    serve.ts            # somtum serve — local dashboard server
    stats.ts            # somtum stats
    doctor.ts           # somtum doctor — health checks
    hook.ts             # internal: dispatches hook events by name
    search.ts / show.ts / forget.ts / edit.ts
    list.ts             # somtum list
    reset.ts            # somtum reset — wipe project DB
    export.ts / import.ts / purge.ts / sync.ts / rebuild.ts / reindex.ts
    config_cmd.ts
    suggest_claude_md.ts
  core/
    db.ts               # SQLite setup, migration runner
    store.ts            # MemoryStore — CRUD for observations
    cache.ts            # PromptCache — exact + fuzzy lookup
    retriever/          # bm25, embeddings, hybrid, index, factory
    extractor.ts        # session transcript → observations (Claude Haiku)
    index_gen.ts        # renders index.md (incremental past 1k obs)
    memory_files.ts     # writes memories/<YYYY-MM>/<ulid>.md
    retrieval_stats.ts
    embeddings.ts       # Embedder interface + encode/decode utils
    privacy.ts          # redact() — runs on every capture
    tokens.ts           # gpt-tokenizer wrapper
  hooks/
    post_session.ts     # SessionEnd/PreCompact: extract → store → index → warm-start
    pre_prompt.ts       # UserPromptSubmit: cache lookup + auto-inject + false-hit detection
    pre_read.ts         # PreToolUse: file gating
  mcp/                  # MCP server + tool implementations
  dashboard/
    index.html          # single-page dashboard (served by somtum serve)
  config.ts             # global + project config merge
  index.ts              # public API for embedding Somtum
src/db/migrations/      # NNN_name.sql migration files
test/
  golden/               # per-strategy retrieval golden sets
  bench/                # hot-path latency benchmarks
  fixtures/             # synthetic session transcripts
```

---

## একটি নতুন পর্যবেক্ষণের ধরন যোগ করা

1. `src/core/schema.ts`-এ zod enum প্রসারিত করুন
2. `src/core/extractor.ts`-এ extractor prompt আপডেট করুন
3. `test/fixtures/`-এ একটি fixture এবং একটি assertion যোগ করুন
4. নতুন সেকশন রেন্ডার করতে `src/core/index_gen.ts` আপডেট করুন

## একটি নতুন MCP টুল যোগ করা

1. `src/mcp/tools.ts`-এ zod দিয়ে args + response সংজ্ঞায়িত করুন
2. `src/mcp/server.ts`-এ নিবন্ধন করুন
3. প্রতিক্রিয়ায় অবশ্যই একটি `tokens` ফিল্ড থাকতে হবে
4. `src/mcp/server.test.ts`-এ একটি integration test যোগ করুন

## একটি নতুন CLI কমান্ড যোগ করা

1. `src/cli/index.ts`-এ কমান্ড যোগ করুন (commander)
2. `src/cli/`-এর অধীনে একটি নতুন ফাইলে handler implement করুন
3. `test/`-এ একটি test যোগ করুন

## একটি নতুন রিট্রিভাল কৌশল যোগ করা

1. `src/core/retriever/`-এ `Retriever` ইন্টারফেস implement করুন
2. `src/core/retriever/factory.ts`-এ নিবন্ধন করুন
3. `test/golden/`-এ একটি golden test সেট যোগ করুন

---

## ডেটাবেস মাইগ্রেশন

মাইগ্রেশনগুলি সংখ্যাযুক্ত SQL ফাইল হিসেবে `src/db/migrations/`-এ থাকে (`NNN_name.sql`)। `src/core/db.ts`-এ migration runner স্টার্টআপে সেগুলি ক্রমানুসারে প্রয়োগ করে।

একটি মাইগ্রেশন যোগ করতে:

1. `src/db/migrations/<next-number>_description.sql` তৈরি করুন
2. SQL লিখুন (যেখানে সম্ভব idempotent হতে হবে)
3. একটি নতুন DB এবং একটি বিদ্যমান DB দিয়ে পরীক্ষা করুন

---

## রিলিজ প্রক্রিয়া

Somtum versioning-এর জন্য [changesets](https://github.com/changesets/changesets) ব্যবহার করে:

```bash
pnpm changeset          # আপনার পরিবর্তন বর্ণনা করুন
pnpm changeset version  # versions bump করুন (CI এটি করে)
pnpm release            # npm-এ প্রকাশ করুন (CI এটি করে)
```
