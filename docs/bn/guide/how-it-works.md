# এটি কীভাবে কাজ করে

প্রতিটি Claude Code সেশন শেষে, Somtum সেশন ট্রান্সক্রিপ্ট পড়ে এবং Claude Haiku-কে রাখার মতো অংশগুলি এক্সট্র্যাক্ট করতে বলে — সিদ্ধান্ত, বাগ ফিক্স, যা শেখা হয়েছে। সেই পর্যবেক্ষণগুলি SQLite-এ স্থানীয়ভাবে সংরক্ষিত হয়। **প্রতিটি পরবর্তী প্রম্পটে**, Somtum স্বয়ংক্রিয়ভাবে সবচেয়ে প্রাসঙ্গিক মেমরিগুলি পুনরুদ্ধার করে এবং সেগুলি কনটেক্সটে ইনজেক্ট করে।

## মেমরি লাইফসাইকেল

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                      │
│          you code · debug · review · make decisions         │
└──────────────────────────────┬──────────────────────────────┘
                               │ SessionEnd / PreCompact
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Capture Pipeline                        │
│                                                             │
│  session transcript ──► Haiku extracts observations         │
│                                                             │
│      decisions · bug fixes · learnings · commands           │
│                                                             │
│  PreCompact ─── writes warm-start file ──► next session     │
└──────────────────────────────┬──────────────────────────────┘
                               │ persisted locally
                               ▼
                 ┌─────────────────────────┐
                 │  ~/.somtum/projects/    │
                 │     <project-hash>/     │
                 │                         │
                 │  db.sqlite              │
                 │  index.md               │
                 │  memories/YYYY-MM/      │
                 └────────────┬────────────┘
                              │ every prompt (UserPromptSubmit)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Auto-Inject Pipeline                      │
│                                                             │
│  1. Prompt cache lookup (exact + fuzzy match)               │
│  2. BM25 recall — top-k memories, min_relevance filter      │
│  3. Warm-start context (if session just compacted)          │
│  4. Token budget line prepended (show_budget=true)          │
│                                                             │
│      all injected as additionalContext automatically        │
└─────────────────────────────────────────────────────────────┘
```

## কী ক্যাপচার হয় — একটি উদাহরণ

আপনি একটি auth বাগ ডিবাগ করেন এবং একটি মডিউল রিফ্যাক্টর করেন। সেশন শেষে, Somtum এরকম কিছু এক্সট্র্যাক্ট করে:

```json
[
  {
    "kind": "bugfix",
    "title": "JWT refresh loop caused by missing expiry check",
    "body": "The refresh token loop was triggered because we checked token.exp < Date.now() instead of token.exp < Date.now() / 1000. Unix timestamps are in seconds, not milliseconds.",
    "files": ["src/auth/refresh.ts"]
  },
  {
    "kind": "decision",
    "title": "Use pnpm workspaces — npm hoisting breaks shared types",
    "body": "Switched from npm to pnpm because npm's hoisting puts shared type packages in the wrong node_modules scope, breaking type inference across packages.",
    "files": ["package.json", "pnpm-workspace.yaml"]
  }
]
```

পরবর্তী সেশনে, আপনি যখন "আমরা কেন pnpm ব্যবহার করছি?" জিজ্ঞেস করেন বা `src/auth/refresh.ts` খোলেন, Claude এই মেমরিগুলি খুঁজে পায় এবং ইতিমধ্যেই কনটেক্সট জানে।

## আর্কিটেকচার

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code / Agent                     │
└──────────┬──────────────────────────────┬───────────────────┘
           │ hooks                        │ MCP tools
           ▼                              ▼
┌─────────────────────┐         ┌──────────────────────────┐
│  Hooks              │         │   MCP Tools              │
│                     │         │                          │
│  UserPromptSubmit ──┼─cache──▶│ cache_lookup             │
│                   ──┼─inject─▶│ recall / get             │
│  SessionEnd ────────┼─capture▶│ remember / update        │
│  PreCompact ────────┼─warmst─▶│ forget                   │
│  PreToolUse (Read) ─┼─gate───▶│ stats                    │
│                     │         │ report_false_hit          │
└──────────┬──────────┘         └────────────┬─────────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core (TypeScript)                      │
│                                                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ PromptCache  │  │  MemoryStore    │  │   Retriever   │  │
│  │              │  │                 │  │               │  │
│  │ exact hash   │  │ observations    │  │ bm25(default) │  │
│  │ fuzzy embed  │  │ scope: project  │  │ embeddings    │  │
│  │ fingerprint  │  │         global  │  │ index         │  │
│  │ false_hits   │  │       workspace │  │ hybrid        │  │
│  └──────────────┘  └─────────────────┘  └───────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  SQLite WAL + ~/.somtum/     │
                └─────────────────────────────┘
```

## রিট্রিভাল কৌশল

| কৌশল | কীভাবে কাজ করে | সবচেয়ে ভালো | খরচ |
| --- | --- | --- | --- |
| **`bm25`** | শিরোনাম + বডি + ট্যাগে কীওয়ার্ড অনুসন্ধান (SQLite FTS5, কোনো বাহ্যিক নির্ভরতা নেই) | সঠিক শব্দ, অফলাইন সেটআপ | প্রায় শূন্য |
| **`embeddings`** | একটি ৩০ MB স্থানীয় ONNX মডেল ব্যবহার করে সিমান্টিক সিমিলারিটি (bge-small-en-v1.5) | "auth সম্পর্কে আমরা কী সিদ্ধান্ত নিয়েছিলাম?" ধরনের কোয়েরি | ~৫ ms ১০k মেমরিতে |
| **`index`** | একটি কম্প্যাক্ট মেমরি ক্যাটালগ Haiku-তে পাঠায়; মডেল প্রাসঙ্গিক ID বেছে নেয় | প্যারাফ্রেজড বা ফাজি কোয়েরি | ১টি Haiku API কল |
| **`hybrid`** | BM25 + embeddings ফলাফল মার্জ করে Haiku দ্বারা পুনরায় র‍্যাংক করা | সাধারণ ক্ষেত্রে (সর্বোত্তম রিকল) | BM25 + embeddings + ১টি Haiku কল |

**ডিফল্ট হল `bm25`** — অফলাইনে কাজ করে, কোনো সেটআপ প্রয়োজন নেই। এমবেডিং ডাউনলোড হয়ে গেলে `hybrid` সক্ষম করুন।

কৌশল পরিবর্তন করতে:

```bash
# সিমান্টিক সার্চ সক্ষম করুন (একবার ৩০ MB মডেল ডাউনলোড করে)
somtum config set retrieval.embeddings.enabled true
somtum reindex

# সর্বোত্তম রিকলের জন্য hybrid-এ পরিবর্তন করুন
somtum config set retrieval.strategy hybrid
```

সম্পূর্ণ বিকল্পের জন্য [কনফিগারেশন](/bn/reference/configuration) দেখুন।

## মেমরির ধরন

Somtum ছয়টি বিভাগে পর্যবেক্ষণ ক্যাপচার করে:

| ধরন | বিবরণ |
| --- | --- |
| `decision` | আর্কিটেকচারাল বা ডিজাইন পছন্দ এবং তাদের কারণ |
| `learning` | ডিবাগিং বা অন্বেষণের সময় আবিষ্কৃত বিষয় |
| `bugfix` | একটি ফিক্স এবং তার মূল কারণ |
| `command` | দরকারী CLI কমান্ড বা ওয়ার্কফ্লো |
| `file_summary` | একটি ফাইল বা মডিউল কী করে তার সারসংক্ষেপ |
| `other` | মনে রাখার মতো অন্য যেকোনো কিছু |
