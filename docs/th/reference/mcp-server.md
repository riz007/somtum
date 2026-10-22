# เซิร์ฟเวอร์ MCP

เมื่อคุณรัน `somtum init --all` (Claude Code) หรือ `somtum init --agent codex` Somtum จะลงทะเบียน MCP server ที่ agent สามารถเรียกได้เองระหว่างเซสชัน MCP client อื่นๆ ก็ใช้ได้ผ่าน `somtum mcp` (stdio)

## เครื่องมือที่มี

| เครื่องมือ | สิ่งที่ agent ทำกับมัน |
| --- | --- |
| `recall` | ค้นหาความทรงจำเมื่อไม่แน่ใจเกี่ยวกับรายละเอียดโปรเจกต์ รองรับ `strategy` และ `scope` overrides |
| `get` | ดึงเนื้อหาข้อสังเกตเต็มรูปแบบด้วย ID อัปเดต `last_confirmed_at` ในแต่ละ hit |
| `remember` | จัดเก็บข้อสังเกตด้วยตนเอง รองรับ `scope: 'project' \| 'workspace' \| 'global'` |
| `update` | อัปเดตชื่อ เนื้อหา แท็ก หรือไฟล์ของข้อสังเกตที่มีอยู่ มีการ redaction |
| `cache_lookup` | ตรวจสอบ prompt cache โดยตรง |
| `report_false_hit` | รายงานว่าการตอบสนองที่แคชไม่ตอบคำถาม (ปรับข้อมูล fuzzy threshold) |
| `forget` | ลบข้อสังเกตแบบ soft-delete |
| `stats` | รายงานโทเคนที่ประหยัด อัตราการโดน cache จำนวน false-hit และขนาด corpus |

ทุก MCP response มีฟิลด์ `tokens` เพื่อให้ agent คำนวณค่าใช้จ่ายในการดึงข้อมูล

## ขอบเขตหน่วยความจำ

ข้อสังเกตมีฟิลด์ `scope` ที่ควบคุมการมองเห็น:

| ขอบเขต | ความหมาย | ใช้เมื่อ |
| --- | --- | --- |
| `project` | ค่าเริ่มต้น มองเห็นเฉพาะในโปรเจกต์นี้ | การตัดสินใจ bugfix และข้อเรียนรู้ส่วนใหญ่ |
| `workspace` | แชร์ข้ามโปรเจกต์ผ่าน MCP tool `recall` | ข้อตกลงของทีม library ที่ต้องการ กฎ global |
| `global` | เหมือน workspace สงวนไว้สำหรับความชอบส่วนตัวที่ครอบคลุมทุกโปรเจกต์ | ความชอบในการเขียนโค้ดส่วนตัวของคุณ |

```bash
# จัดเก็บข้อสังเกตแบบ workspace-scoped จากภายในเซสชัน:
remember("Always use pnpm for Node projects", body="...", scope="workspace")
```

## การตั้งค่า

`somtum init --all` เขียน `.mcp.json` ไปยัง root ของโปรเจกต์:

```json
{
  "mcpServers": {
    "somtum": {
      "command": "somtum",
      "args": ["mcp"]
    }
  }
}
```

สำหรับ Codex คำสั่ง `somtum init --agent codex` จะเพิ่ม server เดียวกันลงใน `.codex/config.toml` ของโปรเจกต์:

```toml
[mcp_servers.somtum]
command = "somtum"
args = ["mcp"]
```

รีสตาร์ท agent หลังจากรัน `init` เพื่อรับ MCP configuration (Codex อ่าน config เฉพาะโปรเจกต์ที่ trusted)

::: tip การยืนยัน
ตรวจสอบว่า `.mcp.json` มีอยู่ใน root ของโปรเจกต์:

```bash
cat .mcp.json
```
:::
