# Machi Koro 2 Online (ภาษาไทย)

เว็บเกม Machi Koro 2 เล่นออนไลน์กับเพื่อน 2–5 คน แบบ realtime — ไม่ต้องสมัครสมาชิก ใช้แค่ชื่อเล่น + รหัสห้อง/ลิงก์เชิญ

> ⚠️ ชุดการ์ดตอนนี้เป็น **DEMO / UNVERIFIED DECK** — จำนวนสำเนาการ์ดยังไม่ได้ยืนยันจาก Rulebook (ดู `docs/RULE_ISSUES.md`)

## โครงสร้าง
```
packages/game-engine   Pure TS engine (deterministic, seeded RNG) + ข้อมูลการ์ด + protocol types + Vitest
apps/worker            Cloudflare Worker + Durable Object `GameRoom` (SQLite, WebSocket Hibernation)
apps/web               React + Vite + Tailwind v4 (UI ภาษาไทย, responsive)
data/                  JSON ที่ export จาก engine (cards_localized, establishments_th, landmarks_th, manifests)
translations/          Thai Translation Reference (แหล่งข้อความการ์ด)
docs/                  Audit, RULE_ISSUES, DEPLOY
```

## รันในเครื่อง
```bash
npm install
npm test                      # unit tests ของ engine
npm run dev:worker            # http://127.0.0.1:8787
npm run dev:web               # http://localhost:5173
```
เปิด 2 แท็บขึ้นไป → แท็บแรก "สร้างห้อง" → คัดลอกลิงก์เชิญไปเปิดในแท็บอื่น (แต่ละแท็บเป็นผู้เล่นคนละคน)

ทดสอบหลาย client ผ่าน server จริง (ต้องเปิด worker ไว้):
```bash
node apps/worker/scripts/smoke.mjs http://127.0.0.1:8787 5
node apps/worker/scripts/fullgame.mjs http://127.0.0.1:8787 4
```

## เล่นออนไลน์
https://mropoom-tech.github.io/machi-koro-2-online/

## Deploy
ดู `docs/DEPLOY.md`
