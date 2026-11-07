---
layout: home

hero:
  name: "Somtum"
  text: "หน่วยความจำแบบโลคัลสำหรับ coding agent"
  tagline: บันทึกการตัดสินใจ การแก้บั๊ก และข้อเรียนรู้จากทุกเซสชันของ Claude Code และ Codex โดยอัตโนมัติ — และนำมันกลับมาใช้ในเซสชันถัดไป ไม่ว่าจะใช้ agent ตัวไหน ไม่ต้องใช้คลาวด์ ไม่ต้องตั้งค่า แค่หน่วยความจำ
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
    details: เมื่อสิ้นสุดเซสชัน โมเดลขนาดเล็ก (Claude Haiku ผ่าน API key หรือ claude CLI หรือ Codex ผ่าน codex CLI) จะดึงข้อสังเกตที่ควรจดจำจากทรานสคริปต์ — การตัดสินใจ การแก้บั๊ก ข้อเรียนรู้ คำสั่ง — และจัดเก็บในฐานข้อมูล SQLite ในเครื่อง
  - icon: ⚡
    title: ฉีดอัตโนมัติในทุกพรอมต์
    details: hook UserPromptSubmit จะดึงความทรงจำที่เกี่ยวข้องมากที่สุดผ่าน BM25 และฉีดเข้าไปก่อนทุกข้อความ ไม่ต้องเรียกคืนข้อมูลด้วยตนเอง
  - icon: 🌶️
    title: แคชพรอมต์
    details: เมื่อพรอมต์ตรงกับพรอมต์เดิมและไฟล์ที่เกี่ยวข้องไม่เปลี่ยน คำตอบเดิมจะถูกเพิ่มเข้าไปในบริบทพร้อมระบุอายุ ไม่ได้ข้ามการเรียกโมเดล แต่ช่วยให้เอเจนต์นำคำตอบเดิมมาใช้ซ้ำได้
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
somtum init   # ติดตั้ง hooks + MCP server ในโปรเจกต์ปัจจุบัน
```

ถ้าใช้ Codex:

```bash
somtum init --agent codex
```

เท่านี้เอง ทุกเซสชันจากนี้ไปจะถูกบันทึกและจดจำ ไม่ว่าจะใช้ agent ตัวไหน Claude Code และ Codex ใช้หน่วยความจำร่วมกันในโปรเจกต์เดียวกัน

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

ในเซสชันถัดไป เมื่อคุณถามว่า "ทำไมถึงใช้ pnpm?" agent รู้อยู่แล้ว ไม่ต้องอธิบายซ้ำ

---

## ตรวจสอบสุขภาพ

รัน `somtum doctor` หลังติดตั้งเพื่อตรวจสอบการตั้งค่า:

```
✓  config          strategy=bm25, k=8
✓  db_open         WAL mode, foreign_keys ON
✓  extraction_backend  claude-cli (auto)
✓  hooks_installed somtum hooks found in .claude/settings.json, .codex/hooks.json
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

## ค่าใช้จ่ายโทเคน

Somtum บันทึกทุกโทเคนที่ใช้ไว้ใน ledger ในเครื่อง `somtum stats` แสดงตัวเลขที่วัดจริง ไม่ใช่การประมาณ:

| ค่าใช้จ่าย | ขอบเขต |
| --- | --- |
| การสกัดเมื่อจบหรือบีบอัดเซสชัน | ส่งเฉพาะส่วนที่ยังไม่เคยสกัด ไม่เรียกโมเดลถ้ามีโทเคนใหม่น้อยกว่า 500 |
| ความทรงจำที่เพิ่มเข้าไปในพรอมต์ | สูงสุด 3 รายการ 1,500 ตัวอักษร เฉพาะเมื่อเกี่ยวข้อง และไม่ส่งซ้ำในเซสชันเดียวกัน |
| สรุปไฟล์ | ไม่มี เว้นแต่จะเปิด file gating |

รายละเอียดทั้งหมด: [What Somtum Costs (English)](/guide/costs)
