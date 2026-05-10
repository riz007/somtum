# CLI রেফারেন্স

## সেটআপ

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum init` | SessionEnd capture হুক ইনস্টল করে |
| `somtum init --cache` | UserPromptSubmit cache + auto-inject হুকও ইনস্টল করে |
| `somtum init --file-gating` | PreToolUse file-gating হুকও ইনস্টল করে |
| `somtum init --all` | সমস্ত হুক + MCP server ইনস্টল করে |
| `somtum init --force` | হুক ইতিমধ্যে থাকলেও পুনরায় ইনস্টল করে |
| `somtum doctor` | DB স্বাস্থ্য, মাইগ্রেশন, হুক, API key, ব্রেকইভেন রেশিও, পুরনো মেমরি পরীক্ষা করে |

## মেমরি

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum list` | সংরক্ষিত মেমরি তালিকা করে (সর্বশেষ প্রথমে) |
| `somtum list --kind decision` | ধরন অনুযায়ী ফিল্টার করুন: `decision \| learning \| bugfix \| command \| file_summary` |
| `somtum list --limit 20` | ২০টি ফলাফলে সীমাবদ্ধ করুন |
| `somtum list --json` | মেশিন-রিডেবল JSON আউটপুট |
| `somtum search <query>` | পর্যবেক্ষণ অনুসন্ধান করুন (ডিফল্ট: `bm25` কৌশল) |
| `somtum search <query> --strategy hybrid` | একটি নির্দিষ্ট রিট্রিভাল কৌশল ব্যবহার করুন |
| `somtum search <query> -k 16` | আরও ফলাফল রিটার্ন করুন |
| `somtum show <id>` | একটি পর্যবেক্ষণের পূর্ণ বডি প্রিন্ট করুন |
| `somtum remember` | ম্যানুয়ালি একটি পর্যবেক্ষণ সংরক্ষণ করুন |
| `somtum forget <id>` | id দ্বারা একটি পর্যবেক্ষণ soft-delete করুন |
| `somtum forget --all` | বর্তমান প্রজেক্টে **সমস্ত** পর্যবেক্ষণ soft-delete করুন |
| `somtum edit <id>` | `$EDITOR`-এ একটি পর্যবেক্ষণের বডি খুলুন |
| `somtum rebuild` | সমস্ত পর্যবেক্ষণ থেকে `index.md` পুনরায় তৈরি করুন |
| `somtum reindex` | এমবেডিং পুনরায় গণনা করুন (এমবেডিং সক্ষম করার পরে বা মডেল পরিবর্তন করার পরে) |
| `somtum suggest-claude-md` | জমা পর্যবেক্ষণ থেকে CLAUDE.md সংযোজন পরামর্শ দিন (ইন্টারেক্টিভ) |
| `somtum suggest-claude-md --dry-run` | লেখা ছাড়াই পরামর্শ প্রিভিউ করুন |
| `somtum suggest-claude-md --yes --limit 20` | স্বয়ংক্রিয়ভাবে নিশ্চিত করুন, সর্বোচ্চ ২০টিতে সীমাবদ্ধ করুন |

## পরিসংখ্যান ও দৃশ্যমানতা

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum stats` | সাশ্রয় করা টোকেন, ক্যাশ হিট রেট, রিট্রিভাল ব্রেকডাউন |
| `somtum stats --json` | মেশিন-রিডেবল JSON আউটপুট |
| `somtum serve` | ব্রাউজারে ভিজ্যুয়াল ড্যাশবোর্ড খুলুন |
| `somtum serve --port <n>` | কাস্টম পোর্ট ব্যবহার করুন (ডিফল্ট: 3000) |
| `somtum serve --no-open` | ব্রাউজার না খুলে সার্ভার শুরু করুন |

## ডেটা ম্যানেজমেন্ট

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum export` | JSON হিসেবে stdout-এ পর্যবেক্ষণ এক্সপোর্ট করুন |
| `somtum export --format jsonl --output obs.jsonl` | JSONL ফাইল হিসেবে এক্সপোর্ট করুন |
| `somtum export --format markdown` | পঠনযোগ্য Markdown হিসেবে এক্সপোর্ট করুন |
| `somtum export --include-deleted` | soft-delete করা এন্ট্রি অন্তর্ভুক্ত করুন |
| `somtum import <file>` | JSON বা JSONL থেকে পর্যবেক্ষণ ইমপোর্ট করুন |
| `somtum purge --older-than 30d` | ৩০ দিনের বেশি পুরনো soft-delete এন্ট্রি স্থায়ীভাবে মুছুন |
| `somtum purge --older-than 30d --dry-run` | না মুছেই প্রিভিউ করুন |
| `somtum reset` | বর্তমান প্রজেক্টের সমস্ত মেমরি **স্থায়ীভাবে** মুছুন (নিশ্চিতকরণ চাইবে) |
| `somtum reset --yes` | নিশ্চিতকরণ এড়িয়ে যান (CI বা স্ক্রিপ্টে উপকারী) |

## কনফিগারেশন

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum config get` | সম্পূর্ণ রিজল্ভড কনফিগ প্রিন্ট করুন |
| `somtum config get retrieval.strategy` | একটি একক কী পড়ুন (ডট-সেপারেটেড) |
| `somtum config set retrieval.strategy hybrid` | `.somtum/config.json`-এ লিখুন |
| `somtum config set retrieval.embeddings.enabled true --global` | `~/.somtum/config.json`-এ লিখুন |

## সিঙ্ক

| কমান্ড | বিবরণ |
| --- | --- |
| `somtum sync status` | স্থানীয় বনাম রিমোট পর্যবেক্ষণ সংখ্যা তুলনা করুন |
| `somtum sync push` | রিমোটে পর্যবেক্ষণ এক্সপোর্ট এবং scp করুন |
| `somtum sync pull` | রিমোট থেকে scp করুন এবং স্থানীয় DB-তে মার্জ করুন |

আপনার রিমোট সেট করুন:

```bash
somtum config set sync.remote "user@host:/path/.somtum/projects/<id>"
```

Somtum হোস্টনেম-সচেতন সিঙ্কিং ব্যবহার করে — একাধিক মেশিন থেকে ডেটা ক্ষতি ছাড়াই পর্যবেক্ষণ মার্জ করে।
