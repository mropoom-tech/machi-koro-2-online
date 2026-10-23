# คู่มือ Deploy (ยังไม่ได้ Deploy จริง — ต้องได้รับอนุญาตก่อน)

## 1. Cloudflare Worker + Durable Objects
1. สมัคร/ล็อกอิน Cloudflare (แผน Workers Free) แล้วรัน `npx wrangler login` ใน `apps/worker`
2. แก้ `apps/worker/wrangler.toml` → `ALLOWED_ORIGINS = "https://<github-user>.github.io"` (ห้ามใช้ `*` บน production)
3. `npm run deploy -w apps/worker` → จะได้ URL เช่น `https://machi-koro-2-online.<subdomain>.workers.dev`
   - Migration `new_sqlite_classes = ["GameRoom"]` = SQLite-backed DO (ใช้ได้บน Free plan)
   - หรือใช้ workflow `Deploy Cloudflare Worker (manual)` โดยตั้ง Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` และ Variable `ALLOWED_ORIGINS`

## 2. GitHub Pages
1. Push repo ขึ้น GitHub (branch `main`)
2. Settings → Pages → Source = **GitHub Actions**
3. Settings → Secrets and variables → Actions → **Variables**: `VITE_API_URL` = URL ของ Worker (เป็นค่าสาธารณะ ไม่ใช่ความลับ)
4. Push → workflow `Test & deploy web to GitHub Pages` จะ test + build ด้วย `VITE_BASE=/<repo>/` แล้ว deploy
5. ลิงก์ห้องใช้ hash route (`/#/room/ABCDE`) จึงไม่ต้องมี SPA fallback 404.html

## 3. ตรวจ Free Tier ก่อนเปิดใช้
ต้องตรวจตัวเลขล่าสุดที่ https://developers.cloudflare.com/workers/platform/pricing/ และ https://developers.cloudflare.com/durable-objects/platform/pricing/ ณ วันที่ deploy (ไม่รับประกันว่าฟรีไม่จำกัด)
การออกแบบที่ช่วยประหยัด:
- 1 DO ต่อห้อง, WebSocket Hibernation (DO ไม่ถูกคิดเวลาระหว่างรอ), ไม่มี polling
- ping ทุก 25 วินาทีตอบด้วย auto-response (ไม่ปลุก DO)
- Storage: snapshot เดียวต่อห้อง (หลัก KB), ลบอัตโนมัติด้วย alarm หลังไม่มีกิจกรรม 24 ชม.
- จำกัดความถี่คำสั่ง 5 ครั้ง/วินาที/การเชื่อมต่อ (burst 20)

## ความปลอดภัย
- Token ผู้เล่น 128-bit สร้างที่ server, เก็บเฉพาะ SHA-256 hash, ส่งผ่านข้อความแรกของ WebSocket (ไม่อยู่ใน URL/log)
- ห้ามคอมมิต `.dev.vars`, `.env*` (อยู่ใน `.gitignore`) — โปรเจกต์นี้ไม่มีความลับฝั่ง frontend
- ภาพการ์ดลิขสิทธิ์: ไม่มีในรีโป; ถ้าจะเพิ่มให้เก็บใน `reference_assets/` (ignored) จนกว่าจะได้สิทธิ์เผยแพร่
