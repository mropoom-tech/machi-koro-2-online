// Tests forfeiting a running game.
// Usage: node apps/worker/scripts/forfeit.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 3000) => { const t = Date.now(); while (!pred()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };
const post = async (path, body) => (await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
function client(code, token) {
  const ws = new WebSocket(`${WS}/api/rooms/${code}/ws`);
  const c = { ws, room: null, id: null, errors: [], notices: [], closeCode: null };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'welcome') c.id = m.playerId;
    if (m.t === 'error') c.errors.push(m.message);
    if (m.t === 'notice') c.notices.push(m.text);
  };
  ws.onclose = (e) => (c.closeCode = e.code);
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}

const created = await post('/api/rooms', { name: 'A' });
const code = created.code;
const tB = (await post(`/api/rooms/${code}/join`, { name: 'B' })).token;
const tC = (await post(`/api/rooms/${code}/join`, { name: 'C' })).token;
const a = client(code, created.token), b = client(code, tB), c = client(code, tC);
await until(() => a.room?.players.filter((p) => p.connected).length === 3);

b.send({ t: 'forfeit' });
await until(() => b.errors.length > 0);
check(b.errors.at(-1).includes('ระหว่างเกม'), 'cannot forfeit in the lobby');

a.send({ t: 'start' });
await until(() => a.room.status === 'playing' && b.room.status === 'playing');
b.send({ t: 'forfeit' });
await until(() => b.closeCode !== null && a.room.game.players.length === 2);
check(b.closeCode === 4005, 'forfeiting player gets close code 4005');
check(a.notices.some((n) => n.includes('B ยอมแพ้')), 'others are notified');
check(a.room.game.log.some((l) => l.text.includes('🏳️ B ยอมแพ้')), 'forfeit logged');
check(a.room.status === 'playing', 'game continues with 2 players');
const reB = client(code, tB);
await until(() => reB.closeCode !== null);
check(reB.closeCode === 4001, 'forfeited player cannot reconnect');

a.send({ t: 'forfeit' }); // host forfeits -> C is the last player and wins; host moves to C
await until(() => a.closeCode !== null && c.room.status === 'ended');
check(c.room.game.winnerId === c.id, 'last remaining player wins');
check(c.room.hostId === c.id, 'host passed to remaining player');

for (const x of [a, b, c, reB]) try { x.ws.close(); } catch {}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
