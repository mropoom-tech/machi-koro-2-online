// Tests leaving the lobby, manual host transfer and automatic host handover.
// Usage: node apps/worker/scripts/host.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
function client(code, token) {
  const ws = new WebSocket(`${WS}/api/rooms/${code}/ws`);
  const c = { ws, room: null, id: null, notices: [], errors: [], closeCode: null };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'welcome') c.id = m.playerId;
    if (m.t === 'notice') c.notices.push(m);
    if (m.t === 'error') c.errors.push(m.code);
  };
  ws.onclose = (e) => (c.closeCode = e.code);
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}
const until = async (pred, ms = 3000) => { const t = Date.now(); while (!pred()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };

const created = await post('/api/rooms', { name: 'A' });
const code = created.body.code;
const tB = (await post(`/api/rooms/${code}/join`, { name: 'B' })).body.token;
const tC = (await post(`/api/rooms/${code}/join`, { name: 'C' })).body.token;
let a = client(code, created.body.token), b = client(code, tB), c = client(code, tC);
await until(() => a.room?.players.filter((p) => p.connected).length === 3);

// non-host cannot transfer
b.send({ t: 'transfer_host', playerId: c.id });
await until(() => b.errors.length > 0);
check(a.room.hostId === a.id, 'non-host cannot transfer host');

// manual transfer A -> B
a.send({ t: 'transfer_host', playerId: b.id });
await until(() => c.room.hostId === b.id);
check(c.notices.some((n) => n.key === 'n_new_host' && n.params.p === 'B'), 'manual transfer A → B broadcasts notice');

// host B leaves the lobby -> host passes to an online player, B's seat removed, B socket closed 4002
b.send({ t: 'leave' });
await until(() => b.closeCode !== null && a.room.players.length === 2);
check(b.closeCode === 4002, 'leaving player gets clean close code 4002');
check(a.room.hostId !== b.id && [a.id, c.id].includes(a.room.hostId), 'host leaving passes host to remaining player');
const reB = client(code, tB);
await until(() => reB.closeCode !== null);
check(reB.closeCode === 4001, 'left player token no longer valid');
check((await post(`/api/rooms/${code}/join`, { name: 'B' })).status === 200, 'name B is free to rejoin as a new player');

// automatic handover: current host disconnects for > 30s
const hostClient = a.room.hostId === a.id ? a : c;
const other = hostClient === a ? c : a;
hostClient.ws.close();
await sleep(5000);
check(other.room.hostId === hostClient.id, 'host keeps role during grace period (5s)');
console.log('      waiting for the 30s grace period…');
await until(() => other.room.hostId === other.id, 40000);
check(other.notices.some((n) => n.key === 'n_new_host' && n.params.why === 'why_auto'), 'host auto-transferred to online player after grace');

// last players leave -> room deleted
other.send({ t: 'leave' });
const joined = await post(`/api/rooms/${code}/join`, { name: 'Z' });
check(joined.status === 200, 'room stays while seats remain');

for (const x of [a, b, c, reB]) try { x.ws.close(); } catch {}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
