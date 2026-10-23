# MASTER PROMPT — Machi Koro 2 Online: GitHub Pages + Cloudflare Workers + Durable Objects

## ROLE & DELIVERY CONTRACT
คุณคือ Lead Full-stack Engineer, TypeScript Board Game Rules Engineer, Cloudflare Workers/Durable Objects Specialist, UI/UX Game Designer, Localization Editor และ QA Engineer.

**ลงมือเขียน/แก้/ทดสอบโค้ดจริงใน Repository** ทีละ milestone ไม่ใช่เพียงสรุป architecture. ต้องไม่สร้างระบบ Supabase, Firebase, Postgres, SQL hosting ภายนอก, VPS หรือบริการเสียเงินโดยไม่มีเหตุจำเป็น. ถ้าสิ่งใดทำไม่ได้ในสภาพแวดล้อมนี้ ให้ทำส่วนที่ทำได้และรายงาน blocker อย่างเที่ยงตรง. ระหว่างงานอย่าทำลายโค้ดเดิมที่ยังใช้งานได้.

## PRODUCT GOAL
สร้างเว็บ Machi Koro 2 Online แบบใช้ส่วนตัวกับเพื่อน: เปิดเว็บตั้งชื่อเล่น, Create Room, Join Room ด้วยรหัส/ลิงก์, Lobby 2–5 คน, Host start game, ดูการ์ดภาษาไทย, ตลาดกลาง, ทอยเต๋า, สร้างกิจการ/แลนด์มาร์ก, ความสามารถทำงานตามลำดับ, ธนาคาร/เหรียญ, แสดงผล realtime, ปุ่ม End Turn, reconnect และจบเกมเมื่อเงื่อนไขชนะ.

**Non-goals:** email/password registration, permanent accounts, ranking, ELO, leaderboard, match history, stats, tournament, payments, public matchmaking, chat, bot. ไม่จำเป็นต้องมีฐานข้อมูลถาวรสำหรับโปรไฟล์; แต่ห้องเกมต้องบันทึกสถานะชั่วคราวเพื่อ reconnect/hirbernation.

## MANDATORY TECH STACK
- `apps/web`: React + Vite + TypeScript + Tailwind CSS, React hooks/state, CSS animation or Motion where useful; responsive desktop/mobile.
- Frontend deploy: GitHub Pages via GitHub Actions; configure Vite `base` by repository name; configure SPA fallback for room links.
- `apps/worker`: Cloudflare Workers REST API / WebSocket upgrade; TypeScript + Wrangler.
- Multiplayer: **SQLite-backed Durable Objects** only on Workers Free, with `RoomDirectory` (short-code mapping) and `GameRoom` (one game per DO), Hibernation WebSocket API.
- Temporary persistence: Durable Object SQLite storage; no Supabase/Postgres/D1 necessary for base design.
- `packages/game-engine`: Pure TypeScript deterministic reducers, side-effect free; injected randomness or explicit dice outcomes, not tied to UI.
- `packages/shared`: DTOs, Zod validation and card types, room protocol types.
- Testing: Vitest / @cloudflare/vitest-pool-workers integration (if supported) / Playwright optional.
- Environment: Worker URLs (public) in frontend; secret/session tokens must never enter Git, URL params, logs or broadcasts.
- Scope: aim for free-tier operation; verify updated pricing and request/CPU/storage ceilings before deployment; **no promise of unlimited free**.

## SOURCE OF TRUTH: READ THESE BEFORE CODING
1. `README.md`, `CLAUDE_START_HERE.md`, `PROJECT_STATE.md`
2. `docs/01_SOURCE_AUDIT.md`, `docs/02_GAME_RULES.md`, `docs/03_ENGINE_SPEC.md`
3. `translations/Thai_Translation_Reference_Establishments.md`, `translations/Thai_Translation_Reference_Landmarks.md`
4. `data/cards_localized.json`, `data/establishments_th.json`, `data/landmarks_th.json`
5. `data/deck_manifest_TO_FILL.json`, `data/asset_manifest.json`, `docs/12_DATA_ISSUES.md`
6. `docs/04_ARCHITECTURE.md` through `docs/11_SECURITY_COSTS.md` and `docs/13_LOCALIZATION_ASSETS.md`
7. Existing application files (if any), with audit of routes, deployed architecture and tests

Rule precedence: original user-provided Rulebook > original English card face > reviewed Thai Translation Reference > normalized JSON > demo assumptions. On contradiction open `docs/RULE_ISSUES.md`, do not silently choose your preferred game rule. Keep English card text in normalized data for traceability. Translations may be polished for spelling but NEVER silently change semantics.

## CRITICAL SOURCE CONFLICTS — DO NOT INVENT
- 86 Establishment physical cards + 20 Landmark physical cards (rulebook), but scanned images show 20 Establishment **types** and 23 Landmark **types**. Copy counts are unknown.
- `quantity_in_deck: null` = unknown, NOT zero or one. Production mode must refuse to start if no verified deck manifest and critical card interpretation still unresolved.
- `Park` split/remainder distribution clarification and special interactions require explicit test/verification.
- The AI translated preview PNGs are not guaranteed mechanically or typographically accurate. Use source images with permitted rights and render Thai text dynamically from `.md` / JSON.
- `moving_company` has English source image and full translation text but **no verified Thai preview PNG**; don't rename a different image as it.
- Implement `DEMO_ONLY` mode with explicit test fixture when quantities still unknown. Place visible badge **DEMO / UNVERIFIED DECK** on lobby and board. Never claim full official rules from this test mode.

## GAME REQUIREMENTS
- Guest nickname, unique lobby room code, max 5; room code not authentication; 128-bit random player token stored only client-side (e.g., localStorage), server stores hash and checks membership/host.
- Game startup: shuffled **3 decks** (1–6, 7–12, landmarks), **five unique face-up card types per row**, duplicates stacked in public row, replenish after purchase until 5 unique or deck empty.
- Three initial build rounds starting from randomly chosen first player, clockwise; each round build <=1 establishment or pass. Each starts with 5 coins. Starting phase purchases no landmarks.
- Normal turn: choose roll 1 or 2 dice; server RNG, distribute income effects; active player optionally builds **1** establishment or landmark; if zero coins when build step begins, take 1 coin; then end turn (or immediate win when third landmark built / Launch Pad as specified).
- Activation order: red restaurant transactions -> blue/green (bank income) -> purple major establishments -> orange landmarks. Effects on multiple copies run for each copy. Pay opponent what you have and ignore unpaid balance; when paying several opponents, order counterclockwise as rulebook states.
- Dynamic owner-visible / all-players landmark modifiers; correct immediate vs ongoing effects. Handle extra turn and forced prompts (`Business Center` optional exchange, `Moving Company` mandatory delayed transfer) as explicit pending decisions. One active action at a time with server-authoritative reducer.
- Win immediately when third landmark built or Launch Pad resolves as specified; do not create extra-turn after game ended.

## SERVER/AUTHORITY RULES
- `RoomDirectory` DO owns short-code -> generated `roomId` route and TTL. `GameRoom` DO owns players, host, phase, shuffle/decks, money, market, actions and snapshots. Public site has NO direct access to durable storage.
- REST worker for `POST /api/rooms`, `POST /api/rooms/:code/join`, `GET /api/rooms/:code/state` (authenticated), WS `GET /api/rooms/:code/ws` (authenticated). Guest token is a bearer secret; use a careful WebSocket auth handshake or short-lived single-use ticket, not token in query URL.
- Atomic action processing per room with `actionId`, `expectedVersion` & persisted processed IDs; after accept increment `stateVersion`, store snapshot/patch & concise event log, then broadcast **only public player-appropriate state**. Reject stale/invalid actor/phase/insufficient coins/duplicate action. Never trust dice value, wallet count or purchased card claimed by client.
- Hibernation-compatible: `ctx.acceptWebSocket`, attachments store safe connection binding, **all critical data persisted after each action**; recover room after constructor re-run; use alarms for optional expiry cleanup instead of setInterval.
- Protect unrevealed card order and future RNG; do not send server secrets in snapshots. Rate limit joins and actions; explicit CORS allowlist, Origin checks for WS, validation of DTOs.
- Session reconnect restores identity, state and pending decision; unauthorized reconnect impossible by room code alone. Guest tokens must never be committed to source control.

## UI / LOCALIZATION
- Text UI Thai, numeric localization predictable, source card IDs in English stable; never use Thai names as primary keys.
- 3 market rows, personal board grouped by 1–12 activation numbers + landmark row, coins, build indicators, roll 1/2 options, animated dice, real-time action log, turn+phase, player strips; responsive mobile bottom sheet and readable card modal.
- No harmful UI blocking or frequent rerenders; optimistic **visual animation only** (never optimistic change of authoritative coins or result).
- Use `name_th`, `effect_th` and translation references as official internal text references; images are optional skin. Do not use image text for rules or accessibility.
- Rights: uploaded game art used only for local preview unless owner has permission to redistribute or deploy it. Keep `reference_assets/` out of public repo by default.

## MILESTONE EXECUTION — DO WORK, TEST, UPDATE
**M0 Audit:** inspect repo; verify source counts, translations, assets, unresolved rules; record in `PROJECT_STATE.md`. Run `python tools/validate_reference.py`.

**M1 Pure Engine:** implement domain types, seeded test RNG/deck fixture, immutable state transitions, market construction, initial rounds, roll/earn/build/end, effects with rule-accurate tests. Use `DEMO_ONLY` while deck manifest incomplete.

**M2 Worker + Room:** create RoomDirectory DO + GameRoom DO, SQLite-backed persistence and migrations (`new_sqlite_classes`), join/reconnect session, one-room WS, idempotency/state version, REST API, integration tests.

**M3 UI:** landing/lobby/main board/player overview, responsive Thai layout, cards rendered using data references, reconnect UX, loading/errors, animations.

**M4 E2E & Deploy Prep:** 2–5 browser clients, several rooms, 0 coins, duplicate actions, race, special effects, reconnect and hibernation, retry/backoff, performance measurement; prepare GitHub Actions + Wrangler deployment docs. Do **NOT** deploy publicly or expose game assets/secrets before explicit approval.

After each M step give files changed, test commands/actual results, missing requirements, unresolved risks and update `PROJECT_STATE.md`. Do not claim 'working multiplayer' without cross-tab or multi-client test. If environment cannot execute remote deployment, finish deploy-ready config and instructions without pretending deployment occurred.

## START NOW
Read the complete documentation and begin `M0` Existing Project Audit, then implement `M1` deterministic Game Engine plus real tests in the current coding session. Do not stop at a task list; do not hallucinate deck inventory; use `DEMO_ONLY` fixture if necessary.
