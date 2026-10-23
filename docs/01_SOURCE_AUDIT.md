# M0 — Source Audit (2026-10-23)

## พบในโปรเจกต์ตอนเริ่ม
| ไฟล์ | สถานะ |
|---|---|
| `Machi_Koro_2_Master_Prompt_GitHub_Cloudflare.md` | ย้ายเป็น `MASTER_PROMPT_GITHUB_CLOUDFLARE.md` |
| `Thai_Translation_Reference_Establishments_New.md` | ย้ายเป็น `translations/Thai_Translation_Reference_Establishments.md` — 20 แบบ ครบ |
| `Thai_Translation_Reference_Landmarks_New.md` | ย้ายเป็น `translations/Thai_Translation_Reference_Landmarks.md` — 23 แบบ ครบ |

## Missing Sources (ไม่มีในโปรเจกต์ — ไม่ได้อ่าน)
`README.md`, `CLAUDE_START_HERE.md`, `PROJECT_STATE.md`, `docs/*`, `data/*.json`, Rulebook PDF (`machi-koro-2_Rulebook-FINAL.indd.pdf`), ภาพการ์ดต้นฉบับ/ภาพพรีวิวภาษาไทย, `tools/validate_reference.py`

ไฟล์ README / PROJECT_STATE / data/*.json / docs ปัจจุบันถูก **สร้างใหม่** ในรอบนี้ (data/*.json สร้างจาก `packages/game-engine/src/cards.ts`)

## ตรวจข้อมูลการ์ด
- Establishments 20 แบบ: ID, ชื่อ EN/TH, สี, สัญลักษณ์, เลขเต๋า, ราคา, ข้อความ EN/TH ครบทุกใบ — ตรวจด้วย unit test
- Landmarks 23 แบบ: ราคา 3 ระดับ (Loan Office ราคาเดียว 10, Launch Pad 45/38/25), ทันที/ต่อเนื่อง, ขอบเขต ครบทุกใบ
- จำนวนสำเนา: **ไม่มีหลักฐาน** → ดู `docs/RULE_ISSUES.md` #1–2
- คำแปลภาษาไทยใช้ตาม Reference ทุกคำ ไม่ได้แก้ความหมาย (ย่อบรรทัด Loan Office เป็นบรรทัดเดียวเท่านั้น)
