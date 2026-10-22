# শুরু করা

## প্রয়োজনীয়তা

- **Node.js 20+**
- **Claude Code অথবা Codex** — Somtum এদের `SessionEnd`, `PreCompact` এবং `UserPromptSubmit` হুক ব্যবহার করে। দুটি এজেন্ট প্রতিটি প্রজেক্টে একটি মেমরি শেয়ার করে।
- **একটি এক্সট্র্যাকশন ব্যাকএন্ড** (নিচে ধাপ ১ দেখুন)। Claude Code বা Codex সাবস্ক্রাইবারদের আলাদা API key লাগে না।

::: tip v2 থেকে আপগ্রেড করছেন?
v2-এর কিছু ক্যাপচার বাগ v3-এ ঠিক করা হয়েছে। [Upgrading to v3](/guide/upgrading-v3) (ইংরেজি) দেখুন।
:::

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

সেশন শেষে Somtum পর্যবেক্ষণ এক্সট্র্যাক্ট করতে একটি ছোট মডেল কল করে। প্রথম যেটি পাওয়া যায় সেটিই ব্যবহার হয়, তাই বেশিরভাগ ক্ষেত্রে কিছু করতে হয় না:

| আপনার কাছে আছে | ব্যবহৃত ব্যাকএন্ড |
| --- | --- |
| শেল প্রোফাইলে `ANTHROPIC_API_KEY` | Anthropic API (Haiku) |
| `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (GLM বা অন্য Anthropic-সামঞ্জস্যপূর্ণ প্রোভাইডার) | সেই প্রোভাইডার |
| Claude Code ইনস্টল করা (`which claude`) | `claude` CLI, আপনার সাবস্ক্রিপশনে |
| Codex ইনস্টল করা (`which codex`) | `codex` CLI, আপনার ChatGPT প্ল্যানে |

নির্দিষ্ট ব্যাকএন্ড বেছে নিতে: `somtum config set extraction.backend codex-cli` (অথবা `anthropic`, `claude-cli`, `auto`)।

**সরাসরি Anthropic API key ব্যবহার করতে:**

**বিকল্প B: সরাসরি Anthropic API key (ঐচ্ছিক — দ্রুততর, মডেল বেছে নিতে দেয়)**

```bash
# ~/.zshrc বা ~/.bashrc-এ যোগ করুন
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

::: warning
key অবশ্যই আপনার শেল প্রোফাইলে থাকতে হবে, শুধু একটি খোলা টার্মিনাল ট্যাবে এক্সপোর্ট করা নয়। হুক সেই শেলের পরিবেশ উত্তরাধিকার করে যা এজেন্টটি *শুরু* করেছিল।
:::

### ধাপ ২ — আপনার প্রজেক্টে ইনিশিয়ালাইজ করুন

**এজেন্টে আপনি যে প্রজেক্ট খোলেন তার root থেকে** রান করুন।

**Claude Code**

```bash
somtum init --all
# ইনস্টল করে:
#   - SessionEnd + PreCompact capture hooks  (মেমরি এক্সট্র্যাকশন)
#   - UserPromptSubmit hook                  (auto-inject + prompt cache)
#   - PreToolUse file-gating hook            (বড় ফাইল সারসংক্ষেপ)
#   - .mcp.json-এ MCP server                 (recall/remember টুল)
```

::: tip --all ব্যবহার করুন
শুধু `somtum init` কেবল ক্যাপচার হুক ইনস্টল করে। মেমরি সংরক্ষিত হয় কিন্তু প্রম্পটে ইনজেক্ট হয় না।
:::

**Codex**

```bash
somtum init --agent codex
# ইনস্টল করে:
#   - .codex/hooks.json   SessionEnd + PreCompact ক্যাপচার, UserPromptSubmit auto-inject
#   - .codex/config.toml  [mcp_servers.somtum]
```

Codex শুধুমাত্র trusted প্রজেক্টের project-level কনফিগ লোড করে। দুটি এজেন্ট একই প্রজেক্টে ব্যবহার করলে দুটি কমান্ডই চালান।

### ধাপ ৩ — স্বাভাবিকভাবে কাজ করুন

`somtum init` রান করা একই ডিরেক্টরি থেকে Claude Code বা Codex খুলুন। স্বাভাবিকভাবে কাজ করুন। সেশন শেষ হলে, হুক ব্যাকগ্রাউন্ডে স্বয়ংক্রিয়ভাবে পর্যবেক্ষণ এক্সট্র্যাক্ট করে (৯০ সেকেন্ডে সীমাবদ্ধ)।

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

এটি আপনার এক্সট্র্যাকশন ব্যাকএন্ড (`extraction_backend`), DB স্বাস্থ্য, হুক ইনস্টলেশন, মাইগ্রেশন, ক্যাশ এবং ব্রেকইভেন রেশিও পরীক্ষা করে — প্রতিটি ব্যর্থ পরীক্ষার জন্য নির্দিষ্ট ফিক্স নির্দেশনা সহ।

---

## সেটআপ যাচাই করা

আপনার প্রথম সেশন শেষ হওয়ার পরে:

**১. হুক লগ পরীক্ষা করুন**

```bash
cat ~/.somtum/hook.log
```

একটি সফল রান:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

প্রতিটি রান কোন ব্যাকএন্ড ব্যবহার করেছে তা লগ করে:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] extraction backend: claude-cli
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

সমস্ত পরীক্ষায় `✓` দেখানো উচিত। `extraction_backend` এবং `hooks_installed` পরীক্ষাগুলি সবচেয়ে বেশি ব্যর্থ হয়।
