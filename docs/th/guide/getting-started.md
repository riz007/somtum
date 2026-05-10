# เริ่มต้นใช้งาน

## ข้อกำหนด

- **Node.js 20+**
- **Claude Code** — Somtum เชื่อมต่อกับ event `SessionEnd`, `UserPromptSubmit` และ `PreToolUse` ของ Claude Code
- **`ANTHROPIC_API_KEY`** _(ไม่บังคับ)_ — ถ้าตั้งค่าไว้ Somtum จะเรียก Anthropic API โดยตรงเพื่อดึงข้อมูล ถ้าไม่มี จะใช้ `claude` CLI ที่มาพร้อมกับ Claude Code แทน ดังนั้น **ไม่จำเป็นต้องมี API key แยกต่างหากสำหรับผู้สมัครสมาชิก Claude Code**

## ติดตั้ง

```bash
npm install -g somtum
```

::: tip หมายเหตุเกี่ยวกับ package manager
**ผู้ใช้ pnpm:** `pnpm add -g somtum` ใช้ได้ถ้าคุณรัน `pnpm setup` แล้ว ถ้าไม่ ให้ใช้ npm

**ผู้ใช้ yarn:** `yarn global add` ไม่รองรับใน Yarn v2+ (Berry) ให้ใช้ npm
:::

### ติดตั้งจาก source

```bash
git clone https://github.com/riz007/somtum
cd somtum
pnpm install
pnpm build
pnpm link --global
```

### หมายเหตุเกี่ยวกับ native module

Somtum ใช้ [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) ซึ่งมี C++ addon แบบ native บนแพลตฟอร์มส่วนใหญ่ (macOS, Linux x64/arm64, Windows x64) ไบนารีที่สร้างไว้ล่วงหน้าจะถูกดาวน์โหลดโดยอัตโนมัติ สำหรับ Alpine Linux / musl หรือสถาปัตยกรรมที่ไม่ปกติ addon จะคอมไพล์จาก source — ต้องติดตั้ง `python`, `make` และ `gcc` ก่อน

---

## เริ่มต้นอย่างรวดเร็ว

### ขั้นตอนที่ 1 — เลือก extraction backend

Somtum เรียก Claude model เมื่อสิ้นสุดเซสชันเพื่อดึงข้อสังเกต เลือกอย่างใดอย่างหนึ่ง:

**ตัวเลือก A: สมาชิก Claude Code (ไม่ต้องตั้งค่าเพิ่มเติม)**

ถ้าคุณติดตั้ง Claude Code แล้ว เสร็จแล้ว Somtum จะเรียก `claude --print` โดยอัตโนมัติเมื่อไม่มี API key ข้ามไปขั้นตอนที่ 2

**ตัวเลือก B: Anthropic API key โดยตรง (ไม่บังคับ — เร็วกว่า ให้คุณเลือกโมเดลได้)**

```bash
# เพิ่มลงใน ~/.zshrc หรือ ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

::: warning
key ต้องอยู่ใน shell profile ของคุณ ไม่ใช่แค่ export ในแท็บเทอร์มินัลที่เปิดอยู่ hook `SessionEnd` รับสภาพแวดล้อมจาก shell ที่*เริ่ม*ต้น Claude Code
:::

### ขั้นตอนที่ 2 — Initialize ในโปรเจกต์ของคุณ

รันจาก**รากของโปรเจกต์ที่คุณทำงานกับ Claude Code**:

```bash
somtum init
```

เพื่อเปิดใช้งานคุณสมบัติทั้งหมดพร้อมกัน (แนะนำ):

```bash
somtum init --all
# ติดตั้ง:
#   - SessionEnd capture hook      (การดึงหน่วยความจำ)
#   - UserPromptSubmit cache hook  (prompt cache + auto-inject)
#   - PreToolUse file-gating hook  (สรุปไฟล์ขนาดใหญ่)
#   - MCP server ใน .mcp.json     (Claude สามารถเรียก recall/remember tools ได้)
```

### ขั้นตอนที่ 3 — ทำงานตามปกติ

เปิด Claude Code จากไดเรกทอรีเดียวกับที่คุณรัน `somtum init` ทำงานตามปกติ เมื่อเซสชันสิ้นสุด hook จะดึงข้อสังเกตโดยอัตโนมัติในเบื้องหลัง (จำกัดที่ 90 วินาที)

### ขั้นตอนที่ 4 — ตรวจสอบหน่วยความจำของคุณ

```bash
# มีข้อสังเกตกี่รายการที่ถูกบันทึก?
somtum stats

# ค้นหาหน่วยความจำ
somtum search "auth jwt rotation"
somtum search "why we use pnpm" --strategy hybrid

# เปิดแดชบอร์ดแบบวิชวล
somtum serve
```

ถ้า `somtum stats` แสดง `memories 0` หลังจากเซสชัน ดู [การแก้ปัญหา](/th/troubleshooting)

### ขั้นตอนที่ 5 — วิเคราะห์ปัญหา

```bash
somtum doctor
```

คำสั่งนี้จะตรวจสอบ API key, สุขภาพ DB, การติดตั้ง hook, การ migrate, cache และอัตราส่วน breakeven — พร้อมคำแนะนำในการแก้ไขสำหรับแต่ละการตรวจสอบที่ล้มเหลว

---

## การยืนยันการตั้งค่า

หลังจากเซสชัน Claude Code แรกสิ้นสุด:

**1. ตรวจสอบ hook log**

```bash
cat ~/.somtum/hook.log
```

การรันที่สำเร็จ:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

ใช้ `claude` CLI fallback (ไม่มี API key):
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] ANTHROPIC_API_KEY not set — will use claude CLI fallback
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

**2. ตรวจสอบสถิติ**

```bash
somtum stats
```

คุณควรเห็น `memories > 0` หลังจากเซสชันที่มีเนื้อหา เซสชันสั้นหรือเล็กน้อย (ไม่มีการตัดสินใจ ไม่มีการแก้บั๊ก) จะได้ผลเป็น 0 อย่างถูกต้อง — ตัวดึงข้อมูลจัดเก็บเฉพาะข้อสังเกตที่ควรจดจำ

**3. รัน doctor**

```bash
somtum doctor
```

การตรวจสอบทั้งหมดควรแสดง `✓` การตรวจสอบ `api_key` และ `hooks_installed` มักล้มเหลวบ่อยที่สุด
