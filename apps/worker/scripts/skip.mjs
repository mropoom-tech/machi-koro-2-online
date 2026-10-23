// Tests kicking players and skipping disconnected players' turns.
// Usage: node apps/worker/scripts/skip.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 3000) => { const t = Date.now(); while (!pred()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };
const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
function client(code, token) {
  const ws = new WebSocket(`${WS}/api/rooms/${code}/ws`);
  const c = { ws, room: null, id: null, errors: [], closeCode: null };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'welcome') c.id = m.playerId;
    if (m.t === 'error') c.errors.push(m.message);
  };
  ws.onclose = (e) => (c.closeCode = e.code);
  c.send = (m) => ws.send(JSON.stringify(m));
  c.lastError = async () => { const n = c.errors.length; await until(() => c.errors.length > n); return c.errors.at(-1); };
  return c;
}

const created = await post('/api/rooms', { name: 'A' });
const code = created.body.code;
const tB = (await post(`/api/rooms/${code}/join`, { name: 'B' })).body.token;
const tC = (await post(`/api/rooms/${code}/join`, { name: 'C' })).body.token;
const a = client(code, created.body.token);
let b = client(code, tB);
const c = client(code, tC);
await until(() => a.room?.players.filter((p) => p.connected).length === 3);

// --- kick
let err = b.lastError(); b.send({ t: 'kick', playerId: c.id });
check((await err).includes('หัวห้อง'), 'non-host cannot kick');
a.send({ t: 'kick', playerId: c.id });
await until(() => c.closeCode !== null && a.room.players.length === 2);
check(c.closeCode === 4003, 'kicked player receives close code 4003');
check(!a.room.players.some((p) => p.name === 'C'), 'kicked player removed from lobby');
const reC = client(code, tC);
await until(() => reC.closeCode !== null);
check(reC.closeCode === 4001, 'kicked player token no longer valid');

// --- start game, play setup until it's B's turn
a.send({ t: 'start' });
await until(() => a.room.status === 'playing' && b.room?.status === 'playing');
err = a.lastError(); a.send({ t: 'kick', playerId: b.id });
check((await err).includes('ก่อนเริ่มเกม'), 'kick refused once the game has started');

const activeId = () => a.room.game.players[a.room.game.activeIndex].id;
const pass = async (cl) => {
  const v = a.room.version;
  cl.send({ t: 'action', actionId: Math.random().toString(36), expectedVersion: cl.room.version, action: { type: 'pass' } });
  await until(() => a.room.version > v && (b.ws.readyState !== 1 || b.room?.version === a.room.version));
};
if (activeId() !== b.id) await pass(a);
check(activeId() === b.id, "it is B's turn");

err = a.lastError(); a.send({ t: 'skip_turn' });
check((await err).includes('หลุด'), 'cannot skip a connected player');

// --- manual skip by host
b.ws.close();
await until(() => a.room.players.find((p) => p.id === b.id).connected === false);
check(a.room.autoSkipAt !== null && a.room.autoSkipAt > a.room.serverNow, 'room reports an auto-skip deadline');
let v = a.room.version;
a.send({ t: 'skip_turn' });
await until(() => a.room.version > v);
check(activeId() === a.id, 'host skipped offline B → A is active');
check(a.room.game.log.at(-1).text.includes('ข้ามเทิร์นของ B'), 'skip logged');
check(a.room.autoSkipAt === null, 'no deadline while active player is online');

// --- automatic skip: A passes, turn returns to offline B, server skips after the grace period
await pass(a);
const s0 = a.room.serverNow;
check(activeId() === b.id && a.room.autoSkipAt - s0 >= 44000, 'B gets a fresh ~45s grace for the new turn');
console.log('      waiting for the 45s automatic skip…');
v = a.room.version;
await until(() => a.room.version > v, 55000);
check(activeId() === a.id, 'server skipped offline B automatically');

// --- B reconnects and can play again
b = client(code, tB);
await until(() => b.room && a.room.players.find((p) => p.id === b.id).connected);
await pass(a);
check(activeId() === b.id && a.room.autoSkipAt === null, 'reconnected B gets the turn with no auto-skip');

for (const x of [a, b, c, reC]) try { x.ws.close(); } catch {}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
