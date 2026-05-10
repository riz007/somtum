# เอกสาร CLI

## การตั้งค่า

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum init` | ติดตั้ง SessionEnd capture hook |
| `somtum init --cache` | ติดตั้ง UserPromptSubmit cache + auto-inject hook ด้วย |
| `somtum init --file-gating` | ติดตั้ง PreToolUse file-gating hook ด้วย |
| `somtum init --all` | ติดตั้ง hooks ทั้งหมด + MCP server |
| `somtum init --force` | ติดตั้งใหม่แม้ว่า hooks จะมีอยู่แล้ว |
| `somtum doctor` | ตรวจสอบสุขภาพ DB, migration, hooks, API key, อัตราส่วน breakeven, ความทรงจำที่เก่า |

## หน่วยความจำ

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum list` | แสดงรายการความทรงจำที่จัดเก็บ (ล่าสุดก่อน) |
| `somtum list --kind decision` | กรองตามประเภท: `decision \| learning \| bugfix \| command \| file_summary` |
| `somtum list --limit 20` | จำกัดผลลัพธ์ที่ 20 รายการ |
| `somtum list --json` | ผลลัพธ์ JSON แบบ machine-readable |
| `somtum search <query>` | ค้นหาข้อสังเกต (ค่าเริ่มต้น: กลยุทธ์ `bm25`) |
| `somtum search <query> --strategy hybrid` | บังคับใช้กลยุทธ์การดึงข้อมูลเฉพาะ |
| `somtum search <query> -k 16` | ส่งคืนผลลัพธ์มากขึ้น |
| `somtum show <id>` | แสดงเนื้อหาเต็มของข้อสังเกต |
| `somtum remember` | จัดเก็บข้อสังเกตด้วยตนเอง |
| `somtum forget <id>` | ลบข้อสังเกตแบบ soft-delete ด้วย id |
| `somtum forget --all` | ลบข้อสังเกต**ทั้งหมด**ในโปรเจกต์ปัจจุบันแบบ soft-delete |
| `somtum edit <id>` | เปิดเนื้อหาข้อสังเกตใน `$EDITOR` |
| `somtum rebuild` | สร้าง `index.md` ใหม่จากข้อสังเกตทั้งหมด |
| `somtum reindex` | คำนวณ embeddings ใหม่ (หลังเปิดใช้งาน embeddings หรือเปลี่ยนโมเดล) |
| `somtum suggest-claude-md` | แนะนำการเพิ่มเนื้อหาใน CLAUDE.md จากข้อสังเกตที่สะสม (แบบ interactive) |
| `somtum suggest-claude-md --dry-run` | ดูตัวอย่างคำแนะนำโดยไม่เขียน |
| `somtum suggest-claude-md --yes --limit 20` | ยืนยันอัตโนมัติ จำกัดที่ 20 อันดับแรกตามโทเคนที่ประหยัด |

## สถิติและการมองเห็น

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum stats` | โทเคนที่ประหยัด อัตราการโดน cache ข้อมูลการดึงข้อมูล |
| `somtum stats --json` | ผลลัพธ์ JSON แบบ machine-readable |
| `somtum serve` | เปิดแดชบอร์ดแบบวิชวลในเบราว์เซอร์ |
| `somtum serve --port <n>` | ใช้พอร์ตที่กำหนดเอง (ค่าเริ่มต้น: 3000) |
| `somtum serve --no-open` | เริ่ม server โดยไม่เปิดเบราว์เซอร์ |

## การจัดการข้อมูล

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum export` | ส่งออกข้อสังเกตไปยัง stdout เป็น JSON |
| `somtum export --format jsonl --output obs.jsonl` | ส่งออกเป็นไฟล์ JSONL |
| `somtum export --format markdown` | ส่งออกเป็น Markdown ที่อ่านได้ |
| `somtum export --include-deleted` | รวมรายการที่ลบแบบ soft-delete |
| `somtum import <file>` | นำเข้าข้อสังเกตจาก JSON หรือ JSONL |
| `somtum purge --older-than 30d` | ลบรายการที่ soft-delete อายุมากกว่า 30 วันแบบถาวร |
| `somtum purge --older-than 30d --dry-run` | ดูตัวอย่างโดยไม่ลบ |
| `somtum reset` | **ลบถาวร** ความทรงจำทั้งหมดสำหรับโปรเจกต์ปัจจุบัน (ถามยืนยัน) |
| `somtum reset --yes` | ข้ามการยืนยัน (มีประโยชน์ใน CI หรือ script) |

## การตั้งค่า

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum config get` | แสดง config ที่แก้ไขแล้วทั้งหมด |
| `somtum config get retrieval.strategy` | อ่าน key เดียว (คั่นด้วยจุด) |
| `somtum config set retrieval.strategy hybrid` | เขียนไปยัง `.somtum/config.json` |
| `somtum config set retrieval.embeddings.enabled true --global` | เขียนไปยัง `~/.somtum/config.json` |

## การซิงก์

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `somtum sync status` | เปรียบเทียบจำนวนข้อสังเกตในเครื่องกับ remote |
| `somtum sync push` | ส่งออกและ scp ข้อสังเกตไปยัง remote |
| `somtum sync pull` | scp จาก remote และรวมเข้าใน local DB |

ตั้ง remote ของคุณ:

```bash
somtum config set sync.remote "user@host:/path/.somtum/projects/<id>"
```

Somtum ใช้การซิงก์ที่คำนึงถึงชื่อโฮสต์ — รวมข้อสังเกตจากหลายเครื่องโดยไม่สูญเสียข้อมูล
