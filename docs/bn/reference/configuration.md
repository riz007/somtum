# কনফিগারেশন

গ্লোবাল কনফিগ `~/.somtum/config.json`-এ থাকে। `.somtum/config.json`-এ প্রতি-প্রজেক্ট কনফিগ এটিকে ওভাররাইড করে (ডিপ মার্জ)।

## সাধারণ সেটিংস

```bash
# সিমান্টিক (এমবেডিং-ভিত্তিক) অনুসন্ধান সক্ষম করুন — একবার একটি ৩০ MB মডেল ডাউনলোড করে
somtum config set retrieval.embeddings.enabled true
somtum reindex

# সর্বোত্তম রিকলের জন্য হাইব্রিড রিট্রিভালে (BM25 + embeddings + rerank) পরিবর্তন করুন
somtum config set retrieval.strategy hybrid

# LLM-ভিত্তিক রিট্রিভাল ব্যবহার করুন (এমবেডিং প্রয়োজন নেই, প্রতি কোয়েরিতে একটি Haiku কল খরচ করে)
somtum config set retrieval.index.enabled true
somtum config set retrieval.strategy index

# file-gating বন্ধ করুন (ডিফল্টে চালু — বড় ফাইল পড়া বাধা দেয় এবং ক্যাশড সারসংক্ষেপ দেয়)
somtum config set file_gating.enabled false

# প্রতি সেশনে এক্সট্র্যাক্ট করা পর্যবেক্ষণ সীমাবদ্ধ করুন (ডিফল্ট: 10)
somtum config set extraction.max_observations_per_session 5

# প্রতিটি প্রম্পটে স্বয়ংক্রিয় মেমরি ইনজেকশন নিয়ন্ত্রণ করুন (ডিফল্ট: চালু)
somtum config set injection.enabled false     # auto-inject বন্ধ করুন
somtum config set injection.k 5              # আরও মেমরি ইনজেক্ট করুন (ডিফল্ট: 3)
somtum config set injection.max_chars 3000   # ইনজেকশন সাইজ ক্যাপ বাড়ান (ডিফল্ট: 1500)
```

## সম্পূর্ণ কনফিগ রেফারেন্স

```jsonc
{
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "trigger": ["SessionEnd", "PreCompact"],
    "max_observations_per_session": 10
  },
  "cache": {
    "enabled": true,
    "fuzzy_match": true,
    "fuzzy_threshold": 0.92,   // false-hit সিগন্যাল পেলে 0.95-এ বাড়ান
    "max_entries": 10000,
    "ttl_days": 90
  },
  "retrieval": {
    "strategy": "bm25",          // bm25 | embeddings | index | hybrid
    "k": 8,
    "rerank_model": "claude-haiku-4-5-20251001",
    "bm25": { "enabled": true },
    "embeddings": {
      "enabled": false,          // ৩০ MB ONNX মডেল ডাউনলোড করতে true সেট করুন
      "model": "Xenova/bge-small-en-v1.5"
    },
    "index": {
      "enabled": false,          // Haiku-কে রিট্রিভার হিসেবে ব্যবহার করতে true সেট করুন
      "model": "claude-haiku-4-5-20251001"
    }
  },
  // Auto-inject: BM25-retrieved memories prepended to every UserPromptSubmit.
  // Uses the hot path (< 2 ms at 1k memories). Disable if you prefer pull-only.
  "injection": {
    "enabled": true,
    "k": 3,                   // প্রতি প্রম্পটে সর্বোচ্চ মেমরি ইনজেক্ট করা হয়
    "max_chars": 1500,        // ইনজেক্ট করা টেক্সটে হার্ড ক্যাপ
    "min_relevance_score": 0, // শুধু উচ্চ-স্কোরের ম্যাচ ইনজেক্ট করতে বাড়ান (যেমন 1.0)
    "show_budget": true       // "[somtum] injected N/M memories (~X tokens)" লাইন যোগ করে
  },
  "file_gating": {
    "enabled": true,          // বড় ফাইল পড়া বাধা দেয়; পরিবর্তে ক্যাশড সারসংক্ষেপ দেয়
    "min_file_size_tokens": 300,
    "exclude_globs": ["**/*.env", "**/secrets/**"]
  },
  "privacy": {
    "telemetry": false,
    "redact_patterns": [
      "api[_-]?key\\s*[:=]\\s*[\"']?[A-Za-z0-9_\\-]{8,}[\"']?",
      "bearer\\s+[A-Za-z0-9_\\-.]+",
      "sk-[A-Za-z0-9_\\-]{20,}",
      "xox[baprs]-[A-Za-z0-9-]{10,}",
      "AKIA[0-9A-Z]{16}"
    ]
  },
  "sync": {
    "enabled": false,
    "backend": "ssh",
    "remote": null    // যেমন "user@host:/home/user/.somtum/projects/<id>"
  }
}
```

## রিট্রিভাল কৌশল তুলনা

| কৌশল | কীভাবে কাজ করে | সবচেয়ে ভালো | খরচ |
| --- | --- | --- | --- |
| **`bm25`** | কীওয়ার্ড অনুসন্ধান (SQLite FTS5, কোনো নির্ভরতা নেই) | সঠিক শব্দ, অফলাইন সেটআপ | প্রায় শূন্য |
| **`embeddings`** | সিমান্টিক সিমিলারিটি, স্থানীয় ৩০ MB ONNX মডেল | "auth সম্পর্কে আমরা কী সিদ্ধান্ত নিয়েছিলাম?" | ~৫ ms ১০k মেমরিতে |
| **`index`** | Haiku একটি কম্প্যাক্ট ক্যাটালগ থেকে প্রাসঙ্গিক ID বেছে নেয় | প্যারাফ্রেজড বা ফাজি কোয়েরি | ১টি Haiku API কল |
| **`hybrid`** | BM25 + embeddings, Haiku দ্বারা পুনরায় র‍্যাংক করা | সাধারণ ক্ষেত্রে (সর্বোত্তম রিকল) | BM25 + embeddings + ১টি Haiku কল |

::: warning হাইব্রিডের জন্য এমবেডিং প্রয়োজন
এমবেডিং সক্ষম না করে `retrieval.strategy = "hybrid"` সেট করলে BM25-এ চুপচাপ ফলব্যাক হয়। `somtum doctor` এটিকে `strategy=hybrid` / `embeddings: disabled` হিসেবে দেখাবে।

হাইব্রিড ব্যবহার করার সময় সর্বদা প্রথমে এমবেডিং সক্ষম করুন:

```bash
somtum config set retrieval.embeddings.enabled true
somtum reindex   # একবার ~৩০ MB ONNX মডেল ডাউনলোড করে
somtum config set retrieval.strategy hybrid
```

যদি আপনার `ANTHROPIC_API_KEY` না থাকে বা অফলাইন অপারেশন পছন্দ করেন, পরিবর্তে `bm25` ব্যবহার করুন।
:::
