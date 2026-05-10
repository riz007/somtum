# การมีส่วนร่วม

ยินดีต้อนรับการมีส่วนร่วม! หน้านี้ครอบคลุมการตั้งค่า development, โครงสร้างโปรเจกต์ และวิธีการเพิ่มคุณสมบัติใหม่

::: tip ต้องการ Changesets
ทุก PR ต้องมีไฟล์ changeset ที่สร้างโดยการรัน `pnpm changeset` ดู [CONTRIBUTING.md](https://github.com/riz007/somtum/blob/main/CONTRIBUTING.md) สำหรับคู่มือฉบับเต็ม
:::

## การตั้งค่า development

```bash
pnpm install
pnpm typecheck        # ตรวจสอบ TypeScript แบบ strict
pnpm test             # vitest unit + golden tests
pnpm test:golden      # retrieval recall@k ต่อกลยุทธ์
pnpm test:bench       # benchmark latency hot-path
pnpm lint             # eslint
pnpm fmt              # prettier
pnpm build            # tsc + copy migrations + copy dashboard → dist/
```

### การติดตั้ง global binary ใหม่จาก local build

หลังจากเปลี่ยนแปลง source:

```bash
pnpm build
npm install -g .      # รันจาก project root
```

การดำเนินการนี้จะแทนที่สำเนาที่ติดตั้ง global ด้วย `dist/` ในเครื่องของคุณ

---

## โครงสร้างโปรเจกต์

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

## การเพิ่มประเภทข้อสังเกตใหม่

1. ขยาย zod enum ใน `src/core/schema.ts`
2. อัปเดต extractor prompt ใน `src/core/extractor.ts`
3. เพิ่ม fixture ใน `test/fixtures/` และ assertion
4. อัปเดต `src/core/index_gen.ts` เพื่อ render section ใหม่

## การเพิ่ม MCP tool ใหม่

1. กำหนด args + response ด้วย zod ใน `src/mcp/tools.ts`
2. ลงทะเบียนใน `src/mcp/server.ts`
3. Response **ต้อง**มีฟิลด์ `tokens`
4. เพิ่ม integration test ใน `src/mcp/server.test.ts`

## การเพิ่ม CLI command ใหม่

1. เพิ่ม command ใน `src/cli/index.ts` (commander)
2. Implement handler ในไฟล์ใหม่ใต้ `src/cli/`
3. เพิ่ม test ใน `test/`

## การเพิ่มกลยุทธ์การดึงข้อมูลใหม่

1. Implement interface `Retriever` ใน `src/core/retriever/`
2. ลงทะเบียนใน `src/core/retriever/factory.ts`
3. เพิ่ม golden test set ใน `test/golden/`

---

## Database migrations

Migration อยู่ใน `src/db/migrations/` เป็นไฟล์ SQL แบบลำดับ (`NNN_name.sql`) migration runner ใน `src/core/db.ts` นำไปใช้ตามลำดับเมื่อ startup

การเพิ่ม migration:

1. สร้าง `src/db/migrations/<next-number>_description.sql`
2. เขียน SQL (ควร idempotent ที่เป็นไปได้)
3. ทดสอบด้วย DB ใหม่และ DB ที่มีอยู่แล้ว

---

## กระบวนการ release

Somtum ใช้ [changesets](https://github.com/changesets/changesets) สำหรับ versioning:

```bash
pnpm changeset          # อธิบายการเปลี่ยนแปลงของคุณ
pnpm changeset version  # bump versions (CI ทำสิ่งนี้)
pnpm release            # publish ไปยัง npm (CI ทำสิ่งนี้)
```
