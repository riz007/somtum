# วิธีการทำงาน

เมื่อสิ้นสุดแต่ละเซสชัน Claude Code Somtum จะอ่านทรานสคริปต์ของเซสชันและขอให้ Claude Haiku ดึงส่วนที่ควรจดจำ — การตัดสินใจ การแก้บั๊ก สิ่งที่เรียนรู้ ข้อสังเกตเหล่านั้นจะถูกจัดเก็บในเครื่องใน SQLite **ในทุกพรอมต์ถัดไป** Somtum จะดึงความทรงจำที่เกี่ยวข้องมากที่สุดโดยอัตโนมัติและฉีดเข้าไปในบริบท

## วงจรชีวิตของหน่วยความจำ

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

## สิ่งที่ถูกบันทึก — ตัวอย่าง

คุณดีบักบั๊ก auth และปรับโครงสร้างโมดูล เมื่อสิ้นสุดเซสชัน Somtum จะดึงข้อมูลประมาณนี้:

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

ในเซสชันถัดไป เมื่อคุณถามว่า "ทำไมถึงใช้ pnpm?" หรือเปิด `src/auth/refresh.ts` Claude จะพบความทรงจำเหล่านี้และมีบริบทอยู่แล้ว

## สถาปัตยกรรม

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

## กลยุทธ์การดึงข้อมูล

| กลยุทธ์ | วิธีการทำงาน | เหมาะสำหรับ | ค่าใช้จ่าย |
| --- | --- | --- | --- |
| **`bm25`** | ค้นหาด้วยคีย์เวิร์ดในชื่อ + เนื้อหา + แท็ก (SQLite FTS5 ไม่ต้องการ dependency ภายนอก) | คำที่ตรงกันแน่นอน การตั้งค่าออฟไลน์ | เกือบเป็นศูนย์ |
| **`embeddings`** | ความคล้ายคลึงเชิงความหมายโดยใช้โมเดล ONNX ในเครื่องขนาด 30 MB (bge-small-en-v1.5) | คิวรีแบบ "เราตัดสินใจเรื่อง auth อย่างไร?" | ~5 ms ที่ 10k ความทรงจำ |
| **`index`** | ส่งแคตตาล็อกความทรงจำแบบย่อไปยัง Haiku โมเดลจะเลือก ID ที่เกี่ยวข้อง | คิวรีที่ถอดความหรือ fuzzy | 1 Haiku API call |
| **`hybrid`** | ผล BM25 + embeddings รวมและจัดอันดับใหม่โดย Haiku | กรณีทั่วไป (การดึงข้อมูลที่ดีที่สุด) | BM25 + embeddings + 1 Haiku call |

**ค่าเริ่มต้นคือ `bm25`** — ทำงานออฟไลน์ ไม่ต้องตั้งค่า เปิดใช้งาน `hybrid` เมื่อดาวน์โหลด embeddings แล้ว

เพื่อเปลี่ยนกลยุทธ์:

```bash
# เปิดใช้งาน semantic search (ดาวน์โหลดโมเดล 30 MB ครั้งเดียว)
somtum config set retrieval.embeddings.enabled true
somtum reindex

# เปลี่ยนเป็น hybrid เพื่อการดึงข้อมูลที่ดีที่สุด
somtum config set retrieval.strategy hybrid
```

ดู [การตั้งค่า](/th/reference/configuration) สำหรับตัวเลือกทั้งหมด

## ประเภทของหน่วยความจำ

Somtum บันทึกข้อสังเกตใน 6 หมวดหมู่:

| ประเภท | คำอธิบาย |
| --- | --- |
| `decision` | ตัวเลือกด้านสถาปัตยกรรมหรือการออกแบบและเหตุผล |
| `learning` | สิ่งที่ค้นพบระหว่างการดีบักหรือการสำรวจ |
| `bugfix` | การแก้ไขและสาเหตุหลัก |
| `command` | คำสั่ง CLI หรือ workflow ที่มีประโยชน์ |
| `file_summary` | สรุปว่าไฟล์หรือโมดูลทำอะไร |
| `other` | สิ่งอื่นใดที่ควรจดจำ |
