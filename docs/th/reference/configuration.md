# การตั้งค่า

Config ระดับ global อยู่ที่ `~/.somtum/config.json` Config ระดับโปรเจกต์ที่ `.somtum/config.json` จะ override (deep merge)

## การตั้งค่าที่ใช้บ่อย

```bash
# เปิดใช้งาน semantic search (embedding) — ดาวน์โหลดโมเดล 30 MB ครั้งเดียว
somtum config set retrieval.embeddings.enabled true
somtum reindex

# เปลี่ยนเป็น hybrid retrieval (BM25 + embeddings + rerank) เพื่อการดึงข้อมูลที่ดีที่สุด
somtum config set retrieval.strategy hybrid

# ใช้ LLM-based retrieval (ไม่ต้องการ embeddings ใช้ Haiku call หนึ่งครั้งต่อคิวรี)
somtum config set retrieval.index.enabled true
somtum config set retrieval.strategy index

# ปิด file-gating (เปิดอยู่โดยค่าเริ่มต้น — สกัดกั้นการอ่านไฟล์ขนาดใหญ่และส่งสรุปที่แคชไว้)
somtum config set file_gating.enabled false

# จำกัดข้อสังเกตที่ดึงต่อเซสชัน (ค่าเริ่มต้น: 10)
somtum config set extraction.max_observations_per_session 5

# ควบคุมการฉีดหน่วยความจำอัตโนมัติในทุกพรอมต์ (ค่าเริ่มต้น: เปิด)
somtum config set injection.enabled false     # ปิด auto-inject
somtum config set injection.k 5              # ฉีดหน่วยความจำมากขึ้น (ค่าเริ่มต้น: 3)
somtum config set injection.max_chars 3000   # เพิ่มขีดจำกัดขนาดการฉีด (ค่าเริ่มต้น: 1500)
```

## Config อ้างอิงทั้งหมด

```jsonc
{
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "trigger": ["SessionEnd", "PreCompact"],
    "max_observations_per_session": 10
  },
  "cache": {
    "enabled": true,
    "fuzzy_match": true,
    "fuzzy_threshold": 0.92,   // เพิ่มเป็น 0.95 เมื่อมีสัญญาณ false-hit
    "max_entries": 10000,
    "ttl_days": 90
  },
  "retrieval": {
    "strategy": "bm25",          // bm25 | embeddings | index | hybrid
    "k": 8,
    "rerank_model": "claude-haiku-4-5-20251001",
    "bm25": { "enabled": true },
    "embeddings": {
      "enabled": false,          // ตั้งเป็น true เพื่อดาวน์โหลดโมเดล ONNX 30 MB
      "model": "Xenova/bge-small-en-v1.5"
    },
    "index": {
      "enabled": false,          // ตั้งเป็น true เพื่อใช้ Haiku เป็น retriever
      "model": "claude-haiku-4-5-20251001"
    }
  },
  // Auto-inject: BM25-retrieved memories prepended to every UserPromptSubmit.
  // Uses the hot path (< 2 ms at 1k memories). Disable if you prefer pull-only.
  "injection": {
    "enabled": true,
    "k": 3,                   // จำนวนหน่วยความจำสูงสุดที่ฉีดต่อพรอมต์
    "max_chars": 1500,        // ขีดจำกัดสูงสุดของข้อความที่ฉีด
    "min_relevance_score": 0, // เพิ่มเพื่อฉีดเฉพาะผลที่มีคะแนนสูง (เช่น 1.0)
    "show_budget": true       // แสดงบรรทัด "[somtum] injected N/M memories (~X tokens)"
  },
  "file_gating": {
    "enabled": true,          // สกัดกั้นการอ่านไฟล์ขนาดใหญ่; ส่งสรุปที่แคชไว้แทน
    "min_file_size_tokens": 300,
    "exclude_globs": ["**/*.env", "**/secrets/**"]
  },
  "privacy": {
    "telemetry": false,
    "redact_patterns": [
      "api[_-]?key\\s*[:=]\\s*[\"']?[A-Za-z0-9_\\-]{8,}[\"']?",
      "bearer\\s+[A-Za-z0-9_\\-.]+",
      "sk-[A-Za-z0-9_\\-]{20,}",
      "xox[baprs]-[A-Za-z0-9-]{10,}",
      "AKIA[0-9A-Z]{16}"
    ]
  },
  "sync": {
    "enabled": false,
    "backend": "ssh",
    "remote": null    // เช่น "user@host:/home/user/.somtum/projects/<id>"
  }
}
```

## การเปรียบเทียบกลยุทธ์การดึงข้อมูล

| กลยุทธ์ | วิธีการทำงาน | เหมาะสำหรับ | ค่าใช้จ่าย |
| --- | --- | --- | --- |
| **`bm25`** | ค้นหาด้วยคีย์เวิร์ด (SQLite FTS5 ไม่ต้องการ dependency) | คำที่ตรงกันแน่นอน การตั้งค่าออฟไลน์ | เกือบเป็นศูนย์ |
| **`embeddings`** | ความคล้ายคลึงเชิงความหมาย โมเดล ONNX ในเครื่องขนาด 30 MB | "เราตัดสินใจเรื่อง auth อย่างไร?" | ~5 ms ที่ 10k ความทรงจำ |
| **`index`** | Haiku เลือก ID ที่เกี่ยวข้องจากแคตตาล็อกแบบย่อ | คิวรีที่ถอดความหรือ fuzzy | 1 Haiku API call |
| **`hybrid`** | BM25 + embeddings จัดอันดับใหม่โดย Haiku | กรณีทั่วไป (การดึงข้อมูลที่ดีที่สุด) | BM25 + embeddings + 1 Haiku call |

::: warning Hybrid ต้องการ embeddings
การตั้ง `retrieval.strategy = "hybrid"` โดยไม่เปิดใช้งาน embeddings จะทำให้เปลี่ยนไปใช้ BM25 โดยอัตโนมัติ `somtum doctor` จะแสดงสิ่งนี้เป็น `strategy=hybrid` / `embeddings: disabled`

เปิดใช้งาน embeddings ก่อนเสมอเมื่อใช้ hybrid:

```bash
somtum config set retrieval.embeddings.enabled true
somtum reindex   # ดาวน์โหลดโมเดล ONNX ~30 MB ครั้งเดียว
somtum config set retrieval.strategy hybrid
```

ถ้าคุณไม่มี `ANTHROPIC_API_KEY` หรือต้องการทำงานออฟไลน์ ให้ใช้ `bm25` แทน
:::
