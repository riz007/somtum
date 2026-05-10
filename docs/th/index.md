---
layout: home

hero:
  name: "Somtum"
  text: "หน่วยความจำแบบโลคัลสำหรับ Claude Code"
  tagline: บันทึกการตัดสินใจ การแก้บั๊ก และข้อเรียนรู้จากทุกเซสชันโดยอัตโนมัติ — และนำมันกลับมาใช้ในเซสชันถัดไป ไม่ต้องใช้คลาวด์ ไม่ต้องตั้งค่า แค่หน่วยความจำ
  image:
    src: /logo.png
    alt: Somtum
  actions:
    - theme: brand
      text: เริ่มต้นใช้งาน
      link: /th/guide/getting-started
    - theme: alt
      text: วิธีการทำงาน
      link: /th/guide/how-it-works
    - theme: alt
      text: GitHub
      link: https://github.com/riz007/somtum

features:
  - icon: 🥣
    title: บันทึกอัตโนมัติ
    details: เมื่อสิ้นสุดเซสชัน Claude Haiku จะดึงข้อสังเกตที่ควรจดจำจากทรานสคริปต์ — การตัดสินใจ การแก้บั๊ก ข้อเรียนรู้ คำสั่ง — และจัดเก็บในฐานข้อมูล SQLite ในเครื่อง
  - icon: ⚡
    title: ฉีดอัตโนมัติในทุกพรอมต์
    details: hook UserPromptSubmit จะดึงความทรงจำที่เกี่ยวข้องมากที่สุดผ่าน BM25 และฉีดเข้าไปก่อนทุกข้อความ ไม่ต้องเรียกคืนข้อมูลด้วยตนเอง
  - icon: 🌶️
    title: แคชพรอมต์
    details: พรอมต์ที่ตรงกันทั้งแบบ exact และ fuzzy จะข้ามโมเดลทั้งหมด แคชช่วยประหยัดเครดิต API และทำให้เซสชันทำงานได้เร็วขึ้น
  - icon: 🥕
    title: จัดเก็บแบบโลคัลเท่านั้น
    details: ข้อมูลทั้งหมดอยู่ในฐานข้อมูล SQLite WAL ในเครื่องที่ ~/.somtum/ ไม่มีบัญชีคลาวด์ ไม่มีการส่งข้อมูลออกนอกเครื่อง ยกเว้น Anthropic API
  - icon: 📊
    title: แดชบอร์ดแบบวิชวล
    details: รัน `somtum serve` เพื่อเปิดแดชบอร์ดในเบราว์เซอร์ — ค้นหาความทรงจำ กราฟความรู้ การวิเคราะห์ และปุ่มลืม
  - icon: 🔄
    title: ซิงก์หลายอุปกรณ์
    details: ซิงค์ความทรงจำข้ามอุปกรณ์ด้วย SSH การรวมข้อมูลที่คำนึงถึงชื่อโฮสต์ป้องกันการสูญเสียข้อมูลจากเซสชันต่างๆ
---

## ติดตั้งใน 30 วินาที

```bash
npm install -g somtum
somtum init --all   # ติดตั้ง hooks + MCP server ในโปรเจกต์ปัจจุบัน
```

เท่านี้เอง ทุกเซสชัน Claude Code จากนี้ไปจะถูกบันทึกและจดจำ

---

## สิ่งที่จดจำได้

หลังจากเซสชันดีบักกิ้ง Somtum จะดึงข้อสังเกตแบบนี้และจัดเก็บไว้ในเครื่อง:

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

ในเซสชันถัดไป เมื่อคุณถามว่า "ทำไมถึงใช้ pnpm?" Claude รู้อยู่แล้ว ไม่ต้องอธิบายซ้ำ

---

## ตรวจสอบสุขภาพ

รัน `somtum doctor` หลังติดตั้งเพื่อตรวจสอบการตั้งค่า:

```
✓  config          strategy=bm25, k=8
✓  db_open         WAL mode, foreign_keys ON
✓  hooks_installed somtum hooks found in .claude/settings.json
✓  embeddings      disabled (set retrieval.embeddings.enabled=true to enable)
```

::: warning กลยุทธ์ Hybrid ต้องการ embeddings
ถ้า `doctor` รายงาน `strategy=hybrid` แต่ `embeddings: disabled` somtum จะเปลี่ยนไปใช้ BM25 โดยอัตโนมัติ แก้ไขด้วยคำสั่งเดียว:

```bash
somtum config set retrieval.strategy bm25   # ตรงกับสิ่งที่รันอยู่จริง
```

หรือเปิดใช้งาน hybrid เต็มรูปแบบ (ต้องการ `ANTHROPIC_API_KEY`):

```bash
somtum config set retrieval.embeddings.enabled true
```

ดู [การตั้งค่า → การเปรียบเทียบกลยุทธ์การดึงข้อมูล](/th/reference/configuration#retrieval-strategy-comparison) สำหรับรายละเอียด
:::

---

## ประสิทธิภาพโทเคน

`somtum stats` แสดงว่าหน่วยความจำคุ้มค่าหรือไม่:

| ตัวชี้วัด | สัญญาณที่ดี | สิ่งที่ควรตรวจสอบ |
| --- | --- | --- |
| `breakeven` ≥ 1.5x | ประหยัดมากกว่าที่ใช้ | คาดว่าจะเกิดขึ้นหลังจากมี ~20+ ความทรงจำ |
| `cache hits` > 0 | การค้นหาซ้ำถูกแคชไว้ | ยืนยันว่า `cache.enabled = true` |
| `retrieval calls` สะสม | ความทรงจำถูกเรียกคืนอยู่ | ตรวจสอบว่า `injection.enabled = true` |

โปรเจกต์ใหม่ (< 10 ความทรงจำ) มักแสดงค่าติดลบ — เป็นเรื่องปกติและจะดีขึ้นเมื่อใช้งานมากขึ้น
