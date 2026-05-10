---
layout: home

hero:
  name: "Somtum"
  text: "Claude Code-এর জন্য লোকাল-ফার্স্ট মেমরি"
  tagline: প্রতিটি সেশন থেকে সিদ্ধান্ত, বাগ ফিক্স এবং শিক্ষাগুলি স্বয়ংক্রিয়ভাবে ক্যাপচার করে — এবং পরবর্তী সেশনে আবার ইনজেক্ট করে। কোনো ক্লাউড নেই। কোনো কনফিগ নেই। শুধু মেমরি।
  image:
    src: /logo.png
    alt: Somtum
  actions:
    - theme: brand
      text: শুরু করুন
      link: /bn/guide/getting-started
    - theme: alt
      text: এটি কীভাবে কাজ করে
      link: /bn/guide/how-it-works
    - theme: alt
      text: GitHub
      link: https://github.com/riz007/somtum

features:
  - icon: 🥣
    title: স্বয়ংক্রিয় ক্যাপচার
    details: সেশন শেষে, Claude Haiku ট্রান্সক্রিপ্ট থেকে টেকসই পর্যবেক্ষণ বের করে — সিদ্ধান্ত, বাগ ফিক্স, শিক্ষা, কমান্ড — এবং একটি স্থানীয় SQLite ডেটাবেসে সংরক্ষণ করে।
  - icon: ⚡
    title: প্রতিটি প্রম্পটে স্বয়ংক্রিয় ইনজেকশন
    details: UserPromptSubmit হুক BM25 এর মাধ্যমে সবচেয়ে প্রাসঙ্গিক মেমরিগুলি পুনরুদ্ধার করে এবং প্রতিটি বার্তার আগে ইনজেক্ট করে। কোনো ম্যানুয়াল রিকল স্টেপ প্রয়োজন নেই।
  - icon: 🌶️
    title: প্রম্পট ক্যাশ
    details: এক্সাক্ট এবং ফাজি-ম্যাচড প্রম্পটগুলি মডেলকে সম্পূর্ণভাবে এড়িয়ে যায়। ক্যাশ API ক্রেডিট সাশ্রয় করে এবং সেশনগুলি দ্রুত রাখে।
  - icon: 🥕
    title: শুধুমাত্র স্থানীয় স্টোরেজ
    details: সমস্ত ডেটা ~/.somtum/ এ একটি স্থানীয় SQLite WAL ডেটাবেসে থাকে। কোনো ক্লাউড অ্যাকাউন্ট নেই, কোনো টেলিমেট্রি নেই, Anthropic API ছাড়া কোনো ডেটা আপনার মেশিন ছেড়ে যায় না।
  - icon: 📊
    title: ভিজ্যুয়াল ড্যাশবোর্ড
    details: একটি ব্রাউজার ড্যাশবোর্ড খুলতে `somtum serve` রান করুন — অনুসন্ধানযোগ্য মেমরি ব্রাউজার, নলেজ গ্রাফ, অ্যানালিটিক্স এবং একটি ফর্গেট বাটন।
  - icon: 🔄
    title: মাল্টি-ডিভাইস সিঙ্ক
    details: SSH দিয়ে মেশিন জুড়ে মেমরি সিঙ্ক্রোনাইজ করুন। হোস্টনেম-সচেতন মার্জিং বিভিন্ন মেশিন থেকে সেশন জুড়ে কোনো ডেটা ক্ষতি নিশ্চিত করে না।
---

## ৩০ সেকেন্ডে ইনস্টল করুন

```bash
npm install -g somtum
somtum init --all   # বর্তমান প্রজেক্টে hooks + MCP server ইনস্টল করে
```

এটাই। এখন থেকে প্রতিটি Claude Code সেশন ক্যাপচার এবং মনে রাখা হবে।

---

## কী মনে রাখা হয়

একটি ডিবাগিং সেশনের পরে, Somtum এইরকম পর্যবেক্ষণ বের করে এবং স্থানীয়ভাবে সংরক্ষণ করে:

```json
[
  {
    "kind": "bugfix",
    "title": "JWT refresh loop — Unix timestamps are seconds, not ms",
    "body": "Checked token.exp < Date.now() instead of token.exp < Date.now() / 1000."
  },
  {
    "kind": "decision",
    "title": "Use pnpm workspaces — npm hoisting breaks shared types",
    "body": "Switched from npm because hoisting put shared type packages in the wrong scope."
  }
]
```

পরবর্তী সেশনে, আপনি যখন জিজ্ঞেস করেন "আমরা কেন pnpm ব্যবহার করছি?" Claude ইতিমধ্যেই জানে। আর পুনরায় ব্যাখ্যা করার প্রয়োজন নেই।

---

## স্বাস্থ্য পরীক্ষা

আপনার সেটআপ যাচাই করতে ইনস্টলের পরে `somtum doctor` রান করুন:

```
✓  config          strategy=bm25, k=8
✓  db_open         WAL mode, foreign_keys ON
✓  hooks_installed somtum hooks found in .claude/settings.json
✓  embeddings      disabled (set retrieval.embeddings.enabled=true to enable)
```

::: warning হাইব্রিড কৌশলের জন্য এমবেডিং প্রয়োজন
যদি `doctor` `strategy=hybrid` কিন্তু `embeddings: disabled` রিপোর্ট করে, somtum চুপচাপ BM25-এ ফলব্যাক করে। একটি কমান্ড দিয়ে ঠিক করুন:

```bash
somtum config set retrieval.strategy bm25   # যা আসলে চলছে তার সাথে মেলান
```

অথবা পূর্ণ হাইব্রিড সক্ষম করুন (`ANTHROPIC_API_KEY` প্রয়োজন):

```bash
somtum config set retrieval.embeddings.enabled true
```

বিস্তারিতের জন্য [কনফিগারেশন → রিট্রিভাল কৌশল তুলনা](/bn/reference/configuration#retrieval-strategy-comparison) দেখুন।
:::

---

## টোকেন দক্ষতা

`somtum stats` দেখায় মেমরি কি নিজের মূল্য পরিশোধ করছে কিনা:

| মেট্রিক | ভালো লক্ষণ | কী পরীক্ষা করবেন |
| --- | --- | --- |
| `breakeven` ≥ 1.5x | ব্যয়ের চেয়ে বেশি সাশ্রয় | ~20+ মেমরির পরে প্রত্যাশিত |
| `cache hits` > 0 | পুনরাবৃত্তি কোয়েরি ক্যাশ করা হয়েছে | নিশ্চিত করুন `cache.enabled = true` |
| `retrieval calls` জমছে | মেমরি সক্রিয়ভাবে রিকল হচ্ছে | `injection.enabled = true` পরীক্ষা করুন |

একটি নতুন প্রজেক্ট (< 10 মেমরি) প্রায়ই নেট নেগেটিভ দেখাবে — এটি স্বাভাবিক এবং ব্যবহারের সাথে উন্নত হয়।
