# การแก้ปัญหา

## Somtum ใช้โทเคนมากกว่าที่คาด

เริ่มจากตัวเลขที่วัดจริง:

```bash
somtum stats --since 7d
```

- **การสกัดสูง** เพิ่ม `extraction.min_new_tokens` เพื่อสกัดเฉพาะส่วนที่ใหญ่ขึ้น และใช้ backend `claude` หรือ `codex` CLI เพื่อใช้โควตาของแพ็กเกจแทนเครดิต API
- **บริบทที่ฉีดเข้าไปสูง** ลด `injection.k` หรือ `injection.max_chars`
- **file gating ติดลบ** ปิดด้วย `somtum config set file_gating.enabled false` (`somtum doctor` จะเตือนเองหลังจาก gate ไป 10 ครั้ง)

ดู [What Somtum Costs (English)](/guide/costs)

---

## `somtum stats` แสดง `memories 0` หลังเซสชัน

ตรวจสอบ hook log ก่อน:

```bash
cat ~/.somtum/hook.log
```

**ไม่พบ `claude` CLI และไม่ได้ตั้ง `ANTHROPIC_API_KEY`**

- ถ้าคุณใช้ Claude Code: รัน `which claude` — ถ้าไม่มีผลลัพธ์ ให้ติดตั้ง Claude Code ใหม่หรือเพิ่ม binary ไปยัง `PATH` ของคุณ
- ถ้าคุณต้องการ API โดยตรง: เพิ่ม `export ANTHROPIC_API_KEY="sk-ant-..."` ไปยัง `~/.zshrc` และรัน `source ~/.zshrc` ต้องอยู่ใน profile ไม่ใช่แค่ export ในแท็บเทอร์มินัลปัจจุบัน

รัน `somtum doctor` — การตรวจสอบ `extraction_backend` จะบอกว่า backend ใดจะถูกใช้ ผู้ใช้ Codex ให้ตรวจสอบด้วย `which codex`

**Hook ไม่ได้ติดตั้งในไดเรกทอรีที่ถูกต้อง**

`somtum init` เขียน hook ไปยัง `.claude/settings.json` ในไดเรกทอรีที่คุณรัน ถ้าคุณเปิด Claude Code จากไดเรกทอรีอื่น มันจะอ่าน settings file อื่น

แก้ไข: รัน `somtum init` จากไดเรกทอรีเดียวกับที่คุณใช้เปิด Claude Code

```bash
cd ~/my-project
somtum init
claude   # ต้องเปิดจาก ~/my-project
```

**เซสชันสั้นหรือเล็กน้อย**

ถ้าเซสชันไม่มีการตัดสินใจ การแก้บั๊ก หรือข้อเรียนรู้ (เช่น คุณแค่ขอให้ Claude ทักทาย) ตัวดึงข้อมูลจะส่งคืน 0 ข้อสังเกตอย่างถูกต้อง

---

## `somtum serve` เปิดเบราว์เซอร์แต่แสดง "Connection refused"

นี่เป็นบั๊กที่แก้ไขแล้วใน v1.1.0 อัปเกรด:

```bash
npm install -g somtum@latest
```

ถ้าคุณติดตั้งจาก source ให้ build ใหม่:

```bash
pnpm build
```

---

## `somtum serve` — พอร์ตถูกใช้งานแล้ว

```bash
somtum serve --port 3001
```

---

## Agent ดูเหมือนยังทำงานอยู่หลังจากเซสชันสิ้นสุด

hook `SessionEnd` มี timeout สูงสุด 90 วินาที ถ้าเซสชันดูเหมือนค้างอยู่ ตรวจสอบว่าคุณใช้ v1.1.0+:

```bash
somtum --version
tail -20 ~/.somtum/hook.log
```

---

## การติดตั้งล้มเหลว (node-gyp / better-sqlite3)

ตรวจสอบให้แน่ใจว่าติดตั้ง build tools แล้ว:

- **macOS:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
- **Windows:** `npm install --global --production windows-build-tools`

---

## Embeddings ช้าหรือโมเดลไม่ดาวน์โหลด

`somtum reindex` ครั้งแรกจะดาวน์โหลดโมเดล ONNX ~30 MB จาก Hugging Face ต้องการการเชื่อมต่ออินเทอร์เน็ต การรันครั้งถัดไปจะใช้โมเดลที่แคชไว้

สำหรับเครื่องที่ไม่ต่ออินเทอร์เน็ตหรือถ้าคุณไม่ต้องการใช้ embeddings:

```bash
somtum config set retrieval.embeddings.enabled false
somtum config set retrieval.strategy bm25
```

BM25 ทำงานออฟไลน์ได้อย่างสมบูรณ์และเร็วในทุกขนาด corpus

---

## agent ไม่มี context จากเซสชันก่อนหน้า

**Auto-inject คือสิ่งแรกที่ต้องตรวจสอบ** ตั้งแต่ v1.3.0 Somtum จะฉีดความทรงจำ top-k เข้าไปใน `UserPromptSubmit` ทุกรายการผ่าน cache hook โดยอัตโนมัติ — ไม่ต้องเรียก recall ด้วยตนเอง

1. ยืนยันว่าติดตั้ง cache hook แล้ว: `somtum doctor` → มองหา `hooks_installed ✓`
2. ถ้าไม่ได้ติดตั้ง: `somtum init` (Claude Code) หรือ `somtum init --agent codex`
3. ยืนยันว่าเปิดใช้งาน injection: `somtum config get injection.enabled` → ควรเป็น `true`
4. ตรวจสอบว่ามีความทรงจำจริงๆ: `somtum stats` → `memories > 0`
5. มองหาบรรทัด budget ที่ด้านบนของ context แต่ละ prompt: `[somtum] injected N/M memories (~X tokens)` ถ้าเห็น `0/M` แสดงว่า BM25 ไม่พบการจับคู่ — ลองใช้ prompt ที่มีรายละเอียดมากขึ้นหรือลด `injection.min_relevance_score` เป็น `0`

**การใช้ MCP server** agent ยังสามารถเรียก `recall` โดยตรงเมื่อไม่แน่ใจ ถ้าไม่เกิดขึ้น:

1. ยืนยันว่าลงทะเบียน server แล้ว: `cat .mcp.json` (Claude Code) หรือหา `[mcp_servers.somtum]` ใน `.codex/config.toml` (Codex)
2. รีสตาร์ท agent เพื่อรับ MCP config

---

## คำเตือนความทรงจำที่เก่าใน `somtum doctor`

`doctor` จะเตือนเมื่อความทรงจำเก่ากว่า 90 วันโดยไม่มีการดึงข้อมูลที่ยืนยัน — ข้อสังเกตที่ไม่เคยปรากฏในการค้นหา ตัวเลือก:

```bash
# ตรวจสอบก่อนตัดสินใจ
somtum search "old topic"

# โปรโมตรายการที่มีประโยชน์เป็น workspace scope
remember("...", scope="workspace")

# ลบรายการที่ไม่เกี่ยวข้อง
somtum purge --older-than 90d
```

---

## เริ่มต้นใหม่ — ล้างความทรงจำทั้งหมด

เพื่อ hard-reset หน่วยความจำของโปรเจกต์ (ย้อนกลับไม่ได้):

```bash
somtum reset
# Permanently delete all memories for this project? [y/N] y
```

เพื่อ soft-delete ทุกอย่าง (กู้คืนได้ผ่าน `somtum export --include-deleted`):

```bash
somtum forget --all
```
