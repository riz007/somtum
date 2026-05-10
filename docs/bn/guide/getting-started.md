# শুরু করা

## প্রয়োজনীয়তা

- **Node.js 20+**
- **Claude Code** — Somtum Claude Code-এর `SessionEnd`, `UserPromptSubmit` এবং `PreToolUse` ইভেন্টে হুক করে
- **`ANTHROPIC_API_KEY`** _(ঐচ্ছিক)_ — সেট করা থাকলে, Somtum এক্সট্র্যাকশনের জন্য সরাসরি Anthropic API কল করে। না থাকলে, Somtum Claude Code-এর সাথে আসা `claude` CLI-তে ফলব্যাক করে, তাই **Claude Code সাবস্ক্রাইবারদের জন্য আলাদা API key প্রয়োজন নেই**।

## ইনস্টল

```bash
npm install -g somtum
```

::: tip প্যাকেজ ম্যানেজার নোট
**pnpm ব্যবহারকারী:** `pnpm setup` রান করলে `pnpm add -g somtum` কাজ করে। না হলে, npm ব্যবহার করুন।

**yarn ব্যবহারকারী:** Yarn v2+ (Berry)-এ `yarn global add` সমর্থিত নয়। npm ব্যবহার করুন।
:::

### সোর্স থেকে ইনস্টল

```bash
git clone https://github.com/riz007/somtum
cd somtum
pnpm install
pnpm build
pnpm link --global
```

### নেটিভ মডিউল নোট

Somtum [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) ব্যবহার করে, যেখানে একটি নেটিভ C++ অ্যাডন রয়েছে। বেশিরভাগ প্ল্যাটফর্মে (macOS, Linux x64/arm64, Windows x64) একটি প্রি-বিল্ট বাইনারি স্বয়ংক্রিয়ভাবে ডাউনলোড হয়। Alpine Linux / musl বা অস্বাভাবিক আর্কিটেকচারে, অ্যাডন সোর্স থেকে কম্পাইল হয় — `python`, `make` এবং `gcc` উপলব্ধ থাকতে হবে।

---

## দ্রুত শুরু

### ধাপ ১ — এক্সট্র্যাকশন ব্যাকএন্ড বেছে নিন

Somtum পর্যবেক্ষণ এক্সট্র্যাক্ট করতে সেশন শেষে একটি Claude মডেল কল করে। একটি বেছে নিন:

**বিকল্প A: Claude Code সাবস্ক্রিপশন (কোনো অতিরিক্ত সেটআপ নেই)**

যদি আপনার Claude Code ইনস্টল থাকে, আপনি প্রস্তুত। API key না থাকলে Somtum স্বয়ংক্রিয়ভাবে `claude --print` কল করে। ধাপ ২-এ যান।

**বিকল্প B: সরাসরি Anthropic API key (ঐচ্ছিক — দ্রুততর, মডেল বেছে নিতে দেয়)**

```bash
# ~/.zshrc বা ~/.bashrc-এ যোগ করুন
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

::: warning
key অবশ্যই আপনার শেল প্রোফাইলে থাকতে হবে, শুধু একটি খোলা টার্মিনাল ট্যাবে এক্সপোর্ট করা নয়। `SessionEnd` হুক সেই শেলের পরিবেশ উত্তরাধিকার করে যা Claude Code *শুরু* করেছিল।
:::

### ধাপ ২ — আপনার প্রজেক্টে ইনিশিয়ালাইজ করুন

**Claude Code দিয়ে আপনি যে প্রজেক্টে কাজ করেন তার root থেকে** রান করুন:

```bash
somtum init
```

একবারে সমস্ত ফিচার সক্ষম করতে (প্রস্তাবিত):

```bash
somtum init --all
# ইনস্টল করে:
#   - SessionEnd capture hook      (মেমরি এক্সট্র্যাকশন)
#   - UserPromptSubmit cache hook  (prompt cache + auto-inject)
#   - PreToolUse file-gating hook  (বড় ফাইল সারসংক্ষেপ)
#   - .mcp.json-এ MCP server     (Claude recall/remember টুল কল করতে পারে)
```

### ধাপ ৩ — স্বাভাবিকভাবে কাজ করুন

`somtum init` রান করা একই ডিরেক্টরি থেকে Claude Code খুলুন। স্বাভাবিকভাবে কাজ করুন। সেশন শেষ হলে, হুক ব্যাকগ্রাউন্ডে স্বয়ংক্রিয়ভাবে পর্যবেক্ষণ এক্সট্র্যাক্ট করে (৯০ সেকেন্ডে সীমাবদ্ধ)।

### ধাপ ৪ — আপনার মেমরি পরীক্ষা করুন

```bash
# কতটি পর্যবেক্ষণ ক্যাপচার করা হয়েছে?
somtum stats

# মেমরি অনুসন্ধান করুন
somtum search "auth jwt rotation"
somtum search "why we use pnpm" --strategy hybrid

# ভিজ্যুয়াল ড্যাশবোর্ড খুলুন
somtum serve
```

সেশনের পরে `somtum stats` যদি `memories 0` দেখায়, [সমস্যা সমাধান](/bn/troubleshooting) দেখুন।

### ধাপ ৫ — সমস্যা নির্ণয় করুন

```bash
somtum doctor
```

এটি আপনার API key, DB স্বাস্থ্য, হুক ইনস্টলেশন, মাইগ্রেশন, ক্যাশ এবং ব্রেকইভেন রেশিও পরীক্ষা করে — প্রতিটি ব্যর্থ পরীক্ষার জন্য নির্দিষ্ট ফিক্স নির্দেশনা সহ।

---

## সেটআপ যাচাই করা

আপনার প্রথম Claude Code সেশন শেষ হওয়ার পরে:

**১. হুক লগ পরীক্ষা করুন**

```bash
cat ~/.somtum/hook.log
```

একটি সফল রান:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

`claude` CLI ফলব্যাক ব্যবহার করা (কোনো API key নেই):
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

**২. স্ট্যাটস পরীক্ষা করুন**

```bash
somtum stats
```

একটি উল্লেখযোগ্য সেশনের পরে আপনি `memories > 0` দেখতে পাবেন। সংক্ষিপ্ত বা তুচ্ছ সেশনগুলি (কোনো সিদ্ধান্ত নেই, কোনো বাগ ফিক্স নেই) সঠিকভাবে ০ রিটার্ন করে — এক্সট্র্যাক্টর শুধুমাত্র টেকসই পর্যবেক্ষণ সংরক্ষণ করে।

**৩. doctor রান করুন**

```bash
somtum doctor
```

সমস্ত পরীক্ষায় `✓` দেখানো উচিত। `api_key` এবং `hooks_installed` পরীক্ষাগুলি সবচেয়ে বেশি ব্যর্থ হয়।
