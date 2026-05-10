# โครงสร้างที่จัดเก็บ

ข้อมูลทั้งหมดอยู่ใน `~/.somtum/`:

```
~/.somtum/
├── config.json                         ← config ระดับ global (รวมกับ project config)
├── hook.log                            ← log ที่มี timestamp ของการรัน hook ทุกครั้ง
├── session/
│   └── lh_<id>.json                    ← สถานะ cache-hit ล่าสุดต่อโปรเจกต์ (การตรวจจับ false-hit)
│                                         ไฟล์ที่เก่ากว่า 24 ชม. จะถูกลบโดยอัตโนมัติ
├── warmstart/
│   └── ws_<id>_<timestamp>.json        ← warm-start context ที่เขียนหลัง PreCompact (TTL 30 นาที)
│                                         มี timestamp เพื่อไม่ให้หน้าต่างที่เปิดพร้อมกันเขียนทับกัน
└── projects/
    └── <project_id>/
        ├── db.sqlite                   ← source of truth (SQLite WAL)
        ├── index.md                    ← สำเนาที่อ่านได้ (สร้างใหม่เมื่อ rebuild)
        └── memories/
            └── YYYY-MM/
                └── <ulid>.md           ← ไฟล์ markdown ต่อข้อสังเกต
```

## Project ID

Project ID มาจาก git remote URL (หรือ directory path ถ้าไม่มี remote) โปรเจกต์เดียวกันจะ map ไปยัง ID เดียวกันในทุกเครื่องตราบเท่าที่ remote URL ตรงกัน — นี่คือสิ่งที่ทำให้การซิงก์หลายอุปกรณ์ทำงานได้

## Source of truth

**SQLite คือ source of truth** แก้ไขข้อสังเกตด้วย `somtum edit <id>` ไม่ใช่ด้วยมือ `index.md` และไฟล์ `.md` ต่อข้อสังเกตเป็นสำเนาที่อ่านได้ที่สร้างจาก DB

## Hook log

การรัน hook ทุกครั้งจะถูกเพิ่มต่อท้ายใน `~/.somtum/hook.log` ตรวจสอบเมื่อดีบัก:

```bash
cat ~/.somtum/hook.log
tail -20 ~/.somtum/hook.log
```

## Warm-start files

หลังจาก event `PreCompact` (การบีบอัด context window) Somtum จะเขียนไฟล์ warm-start ที่มี context ล่าสุด ในพรอมต์ถัดไป สิ่งนี้จะถูกฉีดโดยอัตโนมัติเพื่อให้ Claude ทำงานต่อจากที่ค้างไว้ ไฟล์หมดอายุหลัง 30 นาที

## การสำรองข้อมูลหรือย้าย

เพื่อย้ายความทรงจำไปยังเครื่องใหม่:

```bash
# ส่งออกจากเครื่องเก่า
somtum export --format jsonl --output obs.jsonl

# คัดลอกไปยังเครื่องใหม่ แล้ว import
somtum import obs.jsonl
```

หรือใช้การซิงก์ในตัว:

```bash
somtum config set sync.remote "user@newhost:/path/.somtum/projects/<id>"
somtum sync push
```
