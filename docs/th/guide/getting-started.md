# เริ่มต้นใช้งาน

## ข้อกำหนด

- **Node.js 20+**
- **Claude Code หรือ Codex** — Somtum ใช้ hook `SessionEnd`, `PreCompact` และ `UserPromptSubmit` ของทั้งสอง agent ซึ่งใช้หน่วยความจำร่วมกันในแต่ละโปรเจกต์
- **extraction backend หนึ่งตัว** (ดูขั้นตอนที่ 1) สมาชิก Claude Code หรือ Codex ไม่จำเป็นต้องมี API key แยก

::: tip อัปเกรดจาก v2?
บั๊กการบันทึกบางอย่างของ v2 ได้รับการแก้ไขใน v3 ดู [Upgrading to v3](/guide/upgrading-v3) (ภาษาอังกฤษ)
:::

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

เมื่อสิ้นสุดเซสชัน Somtum เรียกโมเดลขนาดเล็กเพื่อดึงข้อสังเกต โดยใช้ backend ตัวแรกที่พร้อมใช้งาน ส่วนใหญ่จึงไม่ต้องตั้งค่าอะไร:

| สิ่งที่คุณมี | backend ที่ใช้ |
| --- | --- |
| `ANTHROPIC_API_KEY` ใน shell profile | Anthropic API (Haiku) |
| `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (GLM หรือผู้ให้บริการที่รองรับ Anthropic API) | ผู้ให้บริการนั้น |
| ติดตั้ง Claude Code แล้ว (`which claude`) | `claude` CLI ผ่าน subscription ของคุณ |
| ติดตั้ง Codex แล้ว (`which codex`) | `codex` CLI ผ่านแพ็กเกจ ChatGPT ของคุณ |

เลือก backend เอง: `somtum config set extraction.backend codex-cli` (หรือ `anthropic`, `claude-cli`, `auto`)

**ถ้าต้องการใช้ Anthropic API key โดยตรง:**

**ตัวเลือก B: Anthropic API key โดยตรง (ไม่บังคับ — เร็วกว่า ให้คุณเลือกโมเดลได้)**

```bash
# เพิ่มลงใน ~/.zshrc หรือ ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
source ~/.zshrc
```

::: warning
key ต้องอยู่ใน shell profile ของคุณ ไม่ใช่แค่ export ในแท็บเทอร์มินัลที่เปิดอยู่ hook รับสภาพแวดล้อมจาก shell ที่*เริ่ม*ต้น agent
:::

### ขั้นตอนที่ 2 — Initialize ในโปรเจกต์ของคุณ

รันจาก**รากของโปรเจกต์ที่คุณเปิดใน agent**

**Claude Code**

```bash
somtum init --all
# ติดตั้ง:
#   - SessionEnd + PreCompact capture hooks  (การดึงหน่วยความจำ)
#   - UserPromptSubmit hook                  (auto-inject + prompt cache)
#   - PreToolUse file-gating hook            (สรุปไฟล์ขนาดใหญ่)
#   - MCP server ใน .mcp.json                (recall/remember tools)
```

::: tip ใช้ --all
`somtum init` เฉยๆ ติดตั้งเฉพาะ capture hook หน่วยความจำจะถูกบันทึกแต่จะไม่ถูกฉีดเข้าไปในพรอมต์
:::

**Codex**

```bash
somtum init --agent codex
# ติดตั้ง:
#   - .codex/hooks.json   SessionEnd + PreCompact capture, UserPromptSubmit auto-inject
#   - .codex/config.toml  [mcp_servers.somtum]
```

Codex โหลด config ระดับโปรเจกต์เฉพาะโปรเจกต์ที่ trusted เท่านั้น ถ้าใช้ทั้งสอง agent ในโปรเจกต์เดียวกัน ให้รันทั้งสองคำสั่ง

### ขั้นตอนที่ 3 — ทำงานตามปกติ

เปิด Claude Code หรือ Codex จากไดเรกทอรีเดียวกับที่คุณรัน `somtum init` ทำงานตามปกติ เมื่อเซสชันสิ้นสุด hook จะดึงข้อสังเกตโดยอัตโนมัติในเบื้องหลัง (จำกัดที่ 90 วินาที)

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

หลังจากเซสชันแรกสิ้นสุด:

**1. ตรวจสอบ hook log**

```bash
cat ~/.somtum/hook.log
```

การรันที่สำเร็จ:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:44.891Z [post_session] ok — inserted=4 cache=2 summaries=1
```

แต่ละครั้งจะบันทึกว่าใช้ backend ใด:
```
2026-04-30T10:15:42.123Z [post_session] starting
2026-04-30T10:15:42.124Z [post_session] extraction backend: claude-cli
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

การตรวจสอบทั้งหมดควรแสดง `✓` การตรวจสอบ `extraction_backend` และ `hooks_installed` มักล้มเหลวบ่อยที่สุด
