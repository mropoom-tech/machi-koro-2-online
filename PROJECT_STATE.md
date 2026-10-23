# PROJECT_STATE — อัปเดต 2026-10-23

## สรุปสถานะ Milestone
| Milestone | สถานะ | หมายเหตุ |
|---|---|---|
| M0 Project Audit | ✅ | `docs/01_SOURCE_AUDIT.md` — มีแค่ master prompt + 2 translation refs; Rulebook/ภาพ/JSON เดิม = Missing Source |
| M1 Core Engine | ✅ | `packages/game-engine` — 29 unit tests ผ่าน |
| M2 Backend & Multiplayer | ✅ (local) | Worker + DO `GameRoom`, REST + WS, token auth, idempotency, state version, persistence, reconnect, TTL alarm |
| M3 Frontend | ✅ | Landing, Create/Join, Lobby, Board, Card modal, Dice animation, Choice dialogs, Log, Victory, mobile layout |
| M4 Integration | ✅ (local) | smoke 2/3/5 ผู้เล่น + bot เล่นจนจบเกม 2/4/5 ผู้เล่น + ทดสอบ 2 แท็บใน browser จริง (สร้าง/เข้าร่วม/สร้างการ์ด/ทอย/refresh กลับเข้าห้อง/มือถือ) |
| M5 Deploy | ✅ Deploy แล้ว (2026-10-23) | เว็บ: https://mropoom-tech.github.io/machi-koro-2-online/ · Worker: https://machi-koro-2-online.mropoomkung.workers.dev · Repo: https://github.com/mropoom-tech/machi-koro-2-online |

## สถาปัตยกรรม (สั้น)
- Engine: `applyAction(state, playerId, action)` คืน state ใหม่ (structuredClone), RNG mulberry32 เก็บใน state, `toPublic()` ตัดกองการ์ด/RNG ก่อนส่ง client
- ลำดับเอฟเฟกต์: แดง (ทวนเข็มจากผู้ทอย) → ฟ้า/เขียว → ม่วง → แลนด์มาร์กต่อเนื่อง → (เลือก) Business Center → Moving Company → ช่วงสร้าง (0 เหรียญ → รับ 1)
- Server: 1 DO ต่อรหัสห้อง (`idFromName(code)`), เก็บ `meta/players/game/processed` ใน storage แล้วค่อย broadcast, ส่ง `room` ก่อน `ack`
- Protocol: `packages/game-engine/src/protocol.ts` — client ส่ง `hello{token}` เป็นข้อความแรก
- ห้อง: `leave` (ใน Lobby ลบที่นั่ง, หัวห้องออก→โอนให้คนที่ออนไลน์), `transfer_host` (เฉพาะหัวห้อง), หัวห้องหลุดเกิน 30 วิ → alarm โอนให้ผู้เล่นออนไลน์คนแรก; `kick` (หัวห้อง, เฉพาะ Lobby, close 4003); ผู้เล่นที่ถึงตาหลุด → หัวห้อง `skip_turn` ได้ทันที หรือ alarm ข้ามให้หลัง 45 วิ/เทิร์น (`forceSkipTurn` ใน engine: ไม่แลกศูนย์ธุรกิจ, บริษัทขนย้ายมอบใบถูกสุด, ไม่สร้าง, ยกเลิกเทิร์นเพิ่ม, ข้ามก่อนทอยไม่ได้เงินสนามบิน); `remove_player` (หัวห้อง, เฉพาะผู้เล่นที่ออฟไลน์) หรืออัตโนมัติเมื่อถูกข้าม 3 เทิร์นติดกัน (`removePlayer` ใน engine: การ์ดออกจากเกม, เหรียญคืนธนาคาร, เหลือ 1 คน = ชนะ, close 4004); `forfeit` (ผู้เล่นยอมแพ้เองระหว่างเกม — กลไกเดียวกับนำออก, close 4005); ระหว่างเกม "ออก" = ตัดการเชื่อมต่อ กลับมาได้
- Client session: sessionStorage (ต่อแท็บ) + localStorage (fallback)

## คำสั่งทดสอบ & ผลล่าสุด
- `npm test` → 40/40 passed
- `npm run typecheck` (engine/worker/web) → ผ่าน; `npm run build:web` → ผ่าน (JS 61 KB gzip)
- `smoke.mjs` 2/3/5 ผู้เล่น → ALL PASSED
- `forfeit.mjs` (ยอมแพ้ / คนสุดท้ายชนะ / โอนหัวห้อง) → ALL PASSED
- `remove.mjs` (หัวห้องนำผู้เล่นออก / นำออกอัตโนมัติหลังข้าม 3 เทิร์น / คนสุดท้ายชนะ) → ALL PASSED (~2.5 นาที)
- `skip.mjs` (เตะผู้เล่น / หัวห้องข้ามเทิร์น / ข้ามอัตโนมัติ 45 วิ / กลับมาเล่นต่อ) → ALL PASSED
- `host.mjs` (ออกจากห้อง / มอบหัวห้อง / โอนอัตโนมัติหลังหลุด 30 วิ) → ALL PASSED
- `fullgame.mjs` 2/4/5 ผู้เล่น → จบเกมด้วยแลนด์มาร์ก 3 แห่ง, action หลังจบถูกปฏิเสธ, ทุก client state ตรงกัน

## Production
- Cloudflare account: mropoomkung@gmail.com (`377f1456…`), Worker `machi-koro-2-online`, `ALLOWED_ORIGINS=https://mropoom-tech.github.io` (local dev ใช้ `apps/worker/.dev.vars` = `*`)
- GitHub Pages deploy อัตโนมัติทุกครั้งที่ push `main` (repo variables: `VITE_API_URL`, `ALLOWED_ORIGINS`)
- Deploy Worker ใหม่: `npx wrangler deploy` ใน `apps/worker` (ต้องรันใน Terminal ของผู้ใช้ — shell ของ agent อ่านไฟล์ login Wrangler คนละที่ ซึ่งยังเป็นบัญชีเก่า pcpdata117)
- ทดสอบบน production: smoke 3 คน ALL PASSED, CORS: origin อื่นได้ 403, เล่น 2 แท็บบนเว็บจริง (สร้าง/เข้าร่วม/สร้างการ์ด/ทอย) ซิงก์ตรงกัน

## TH/EN + ภาพการ์ด + ลูกเต๋าก่อนผล (2026-10-23)
- **สองภาษา:** ปุ่ม TH/EN (จำไว้ใน localStorage ต่อเบราว์เซอร์) — ผู้เล่นในห้องเดียวกันเลือกคนละภาษาได้
  - Server ส่ง *รหัสข้อความ* + params (log / error / notice) → แคตตาล็อกกลาง `packages/game-engine/src/i18n.ts`
  - ข้อความ UI: `apps/web/src/i18n.tsx`; test ตรวจว่าทุกรหัสมีทั้ง TH/EN และไม่มีภาษาไทย hard-code ฝั่ง server
- **ภาพการ์ด (ไม่สาธารณะ):** ต้นฉบับอยู่ใน `asset/` (gitignored) → `node tools/build-card-assets.mjs` → `apps/worker/card-assets/{th,en}/*.webp` (gitignored, 2.9 MB)
  - Worker เสิร์ฟผ่าน Static Assets + `run_worker_first`; ต้องมีตั๋ว HMAC (`CARD_SIGNING_KEY` secret, อายุ 12 ชม.) ที่ได้ตอนเข้าห้อง — ไม่มีตั๋ว/ตั๋วปลอม = 403
  - ข้อจำกัด: ใครก็สร้างห้องเองแล้วเห็นภาพได้ แต่ไม่มี URL สาธารณะถาวร ไม่อยู่ใน Git/GitHub Pages
  - ตั้ง secret ใหม่: `node ../../tools/set-card-key.mjs` ใน `apps/worker` (ต้อง deploy Worker พร้อมโฟลเดอร์ card-assets ในเครื่อง)
  - ผลตรวจปรู๊ฟภาพไทย: `docs/CARD_IMAGE_PROOFREAD.md` (6 ใบความหมายผิด/ตัวเลขหาย มีป้ายเตือนในหน้ารายละเอียด)
- **ลูกเต๋าก่อนผล:** `useRevealedGame` ใน `Board.tsx` — ทอย 0.9 วิ → แสดงหน้าเต๋า + บรรทัดทอย 0.7 วิ → แล้วจึงแสดงเหรียญ/ความสามารถ/การเลือก/หน้าผู้ชนะ (ฝั่ง client เท่านั้น)
- ทดสอบ: engine 40/40, smoke/forfeit/host/skip/remove/fullgame ผ่าน (remove.mjs เคย timeout 1 ครั้งในตัวจำลอง alarm บนเครื่อง ผ่านเมื่อรันซ้ำ), production smoke ผ่าน, ทดสอบ 2 แท็บ TH+EN บนเว็บจริง
- ข้อสังเกต: ภาพโหลดครั้งแรกบน production ช้าหลายวินาที (ยังไม่อยู่ใน cache ของ edge)

## ปัญหา/ความเสี่ยงที่ยังเหลือ
1. (ปิดแล้ว) ชุดการ์ดจริง `VERIFIED`: 86 กิจการ (จำนวนจาก Excel ที่ผู้ใช้ยืนยัน) + แลนด์มาร์ก 23 แบบ แบบละ 1 ใบ
2. ข้อสันนิษฐานกติกา #3–#11 ใน RULE_ISSUES ต้องตรวจกับ Rulebook
3. ภาพไทย 6 ใบข้อความผิด (ดู docs/CARD_IMAGE_PROOFREAD.md) — รอภาพที่แก้แล้ว; ภาพแลนด์มาร์ก EN ความละเอียดต่ำ
4. ยังไม่ได้แยก `RoomDirectory` DO (ใช้ `idFromName(code)` ตรง ๆ + ตรวจชนรหัสตอนสร้าง) — เพียงพอสำหรับใช้กับเพื่อน
5. ส่ง snapshot ทั้งห้องทุกครั้ง (ไม่ใช่ delta) — ขนาดเล็ก (~5–10 KB) จึงยังไม่จำเป็น
6. (ปิดแล้ว) ระบบห้องครบ: ออก / มอบหัวห้อง / เชิญออก / ข้ามเทิร์น / นำออก / ยอมแพ้
7. Wrangler 3.x (มี v4 แล้ว) — ควรอัปเดตก่อน deploy; npm บล็อก postinstall ของ esbuild/workerd แต่ยังรันได้
8. ยังไม่ได้ทดสอบ hibernation ระยะยาว/latency กับผู้เล่นหลายเครื่องจริง; ควรดูโควตาใน Dashboard (Free: 100,000 requests/วัน ตามที่ Dashboard แสดง)

## Milestone ถัดไป
- ได้ Rulebook → กรอก `quantityInDeck` + ปิดประเด็น RULE_ISSUES → เปิดโหมด VERIFIED
- ทดสอบกับเพื่อนจริงหลายเครื่อง
- อัปเดต GitHub Actions เป็นเวอร์ชันที่รองรับ Node 24 และ Wrangler v4
- เพิ่ม: เสียง/แอนิเมชันเหรียญ, ภาพการ์ดเมื่อได้สิทธิ์
