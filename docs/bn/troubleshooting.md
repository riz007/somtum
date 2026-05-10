# সমস্যা সমাধান

## `somtum doctor` ১.৫x-এর নিচে `breakeven_ratio` রিপোর্ট করে

এই সতর্কতার মানে হল somtum আরও টোকেন ব্যয় করছে (মেমরি ইনজেক্ট করছে) সাশ্রয় করার চেয়ে।

**ছোট প্রজেক্টের জন্য স্বাভাবিক।** ~২০-এরও কম মেমরি এবং বিরল রিকল কল সহ, ইনজেকশনের ওভারহেড সুবিধার চেয়ে বেশি। মেমরি স্টোর বাড়ার সাথে স্বাভাবিকভাবে অনুপাত উন্নত হয়।

**hybrid/embeddings মিসম্যাচ পরীক্ষা করুন।** যদি `doctor` `strategy=hybrid` কিন্তু `embeddings: disabled` দেখায়, somtum চুপচাপ BM25-এ ফলব্যাক করছে hybrid ওভারহেড পে করার সময়:

```
✓  config     strategy=hybrid, k=8
✓  embeddings disabled
```

ঠিক করুন: যা আসলে চলছে তার সাথে কৌশল সারিবদ্ধ করুন।

```bash
# বিকল্প ১ — BM25 ব্যবহার করুন (অফলাইন, কোনো API key প্রয়োজন নেই)
somtum config set retrieval.strategy bm25

# বিকল্প ২ — পূর্ণ হাইব্রিড সক্ষম করুন (একটি ৩০ MB ONNX মডেল ডাউনলোড করে, ANTHROPIC_API_KEY প্রয়োজন)
somtum config set retrieval.embeddings.enabled true
somtum reindex
```

`config` এবং `embeddings` উভয় লাইন সামঞ্জস্যপূর্ণ কিনা নিশ্চিত করতে `somtum doctor` আবার রান করুন।

---

## সেশনের পরে `somtum stats` `memories 0` দেখায়

প্রথমে হুক লগ পরীক্ষা করুন:

```bash
cat ~/.somtum/hook.log
```

**`claude` CLI পাওয়া যায়নি এবং কোনো `ANTHROPIC_API_KEY` সেট নেই**

- আপনি Claude Code ব্যবহার করলে: `which claude` রান করুন — কিছু প্রিন্ট না হলে, Claude Code পুনরায় ইনস্টল করুন বা আপনার `PATH`-এ এর বাইনারি যোগ করুন।
- আপনি সরাসরি API পছন্দ করলে: `~/.zshrc`-এ `export ANTHROPIC_API_KEY="sk-ant-..."` যোগ করুন এবং `source ~/.zshrc` রান করুন। প্রোফাইলে থাকতে হবে, শুধু বর্তমান টার্মিনাল ট্যাবে এক্সপোর্ট করলে হবে না।

`somtum doctor` রান করুন — `api_key` পরীক্ষা আপনাকে বলবে ঠিক কোন ব্যাকএন্ড উপলব্ধ।

**সঠিক ডিরেক্টরিতে হুক ইনস্টল করা হয়নি**

`somtum init` `.claude/settings.json`-এ আপনি যে ডিরেক্টরিতে রান করেছিলেন সেখানে হুক লেখে। আপনি যদি ভিন্ন ডিরেক্টরি থেকে Claude Code চালু করেন, এটি একটি ভিন্ন settings ফাইল পড়বে।

ঠিক করুন: Claude Code চালু করতে ব্যবহার করা একই ডিরেক্টরি থেকে `somtum init` রান করুন।

```bash
cd ~/my-project
somtum init
claude   # ~/my-project থেকে চালু করতে হবে
```

**সংক্ষিপ্ত বা তুচ্ছ সেশন**

সেশনে কোনো সিদ্ধান্ত, বাগ ফিক্স বা শিক্ষা না থাকলে (যেমন আপনি শুধু Claude-কে হ্যালো বলতে বলেছিলেন), এক্সট্র্যাক্টর সঠিকভাবে ০ পর্যবেক্ষণ ফেরত দেয়।

---

## `somtum serve` ব্রাউজার খোলে কিন্তু "Connection refused" দেখায়

এটি v1.1.0-এ ঠিক করা একটি বাগ ছিল। আপগ্রেড করুন:

```bash
npm install -g somtum@latest
```

সোর্স থেকে ইনস্টল করলে, পুনরায় build করুন:

```bash
pnpm build
```

---

## `somtum serve` — পোর্ট ইতিমধ্যে ব্যবহারে

```bash
somtum serve --port 3001
```

---

## এজেন্ট সেশন শেষ হওয়ার পরেও চলতে থাকে বলে মনে হয়

`SessionEnd` হুকে ৯০ সেকেন্ডের হার্ড টাইমআউট আছে। সেশনগুলি আটকে থাকলে, আপনি v1.1.0+ ব্যবহার করছেন কিনা যাচাই করুন:

```bash
somtum --version
tail -20 ~/.somtum/hook.log
```

---

## ইনস্টলেশন ব্যর্থ হয় (node-gyp / better-sqlite3)

নিশ্চিত করুন build টুল ইনস্টল আছে:

- **macOS:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
- **Windows:** `npm install --global --production windows-build-tools`

---

## এমবেডিং ধীর বা মডেল ডাউনলোড হবে না

প্রথম `somtum reindex` Hugging Face থেকে একটি ~৩০ MB ONNX মডেল ডাউনলোড করে। এটির জন্য ইন্টারনেট অ্যাক্সেস প্রয়োজন। পরবর্তী রানগুলি ক্যাশ করা মডেল ব্যবহার করে।

এয়ার-গ্যাপড মেশিনে বা এমবেডিং ব্যবহার না করতে চাইলে:

```bash
somtum config set retrieval.embeddings.enabled false
somtum config set retrieval.strategy bm25
```

BM25 সম্পূর্ণরূপে অফলাইনে কাজ করে এবং যেকোনো corpus আকারে দ্রুত।

---

## Claude-এর কাছে আগের সেশনের কনটেক্সট নেই

**Auto-inject প্রথম জিনিস যা পরীক্ষা করতে হবে।** v1.3.0 থেকে, Somtum স্বয়ংক্রিয়ভাবে cache হুকের মাধ্যমে প্রতিটি `UserPromptSubmit`-এ top-k মেমরি ইনজেক্ট করে — কোনো ম্যানুয়াল রিকল স্টেপ প্রয়োজন নেই।

1. cache হুক ইনস্টল নিশ্চিত করুন: `somtum doctor` → `hooks_installed ✓` খুঁজুন
2. ইনস্টল না থাকলে: `somtum init --cache` (বা `somtum init --all`)
3. injection সক্ষম নিশ্চিত করুন: `somtum config get injection.enabled` → `true` হওয়া উচিত
4. মেমরি আসলে আছে কিনা পরীক্ষা করুন: `somtum stats` → `memories > 0`
5. প্রতিটি প্রম্পট কনটেক্সটের শীর্ষে বাজেট লাইন খুঁজুন: `[somtum] injected N/M memories (~X tokens)`। যদি `0/M` দেখেন, BM25 কোনো ম্যাচ খুঁজে পায়নি — আরও বর্ণনামূলক প্রম্পট চেষ্টা করুন বা `injection.min_relevance_score` কে `0`-এ কমিয়ে দিন।

**MCP server ব্যবহার করে** (`somtum init --all`), Claude অনিশ্চিত হলে সরাসরি `recall` কল করতে পারে। না হলে:

1. `.mcp.json` আছে কিনা নিশ্চিত করুন: `cat .mcp.json`
2. MCP config পিক আপ করতে Claude Code পুনরায় চালু করুন

---

## `somtum doctor`-এ পুরনো মেমরি সতর্কতা

`doctor` সতর্ক করে যখন মেমরি ৯০ দিনের বেশি পুরনো কোনো নিশ্চিত রিট্রিভাল ছাড়া — পর্যবেক্ষণ যা কখনো অনুসন্ধানে আসেনি। বিকল্প:

```bash
# সিদ্ধান্ত নেওয়ার আগে পর্যালোচনা করুন
somtum search "old topic"

# দরকারীগুলিকে workspace স্কোপে প্রমোট করুন
remember("...", scope="workspace")

# অপ্রাসঙ্গিকগুলি সরান
somtum purge --older-than 90d
```

---

## নতুন শুরু — সমস্ত মেমরি মুছে ফেলা

একটি প্রজেক্টের মেমরি hard-reset করতে (অপরিবর্তনীয়):

```bash
somtum reset
# Permanently delete all memories for this project? [y/N] y
```

সবকিছু soft-delete করতে (`somtum export --include-deleted` এর মাধ্যমে পুনরুদ্ধারযোগ্য):

```bash
somtum forget --all
```
