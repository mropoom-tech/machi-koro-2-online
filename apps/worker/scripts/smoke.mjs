// Multi-client smoke test against a running worker (default http://127.0.0.1:8787).
// Usage: node apps/worker/scripts/smoke.mjs [baseUrl] [players]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const N = Number(process.argv[3] ?? 3);
const WS_BASE = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

function client(code, token) {
  const ws = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws`);
  const c = { ws, room: null, playerId: null, errors: [], acks: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'welcome') c.playerId = m.playerId;
    if (m.t === 'error') c.errors.push(m.message);
    if (m.t === 'ack') c.acks.push(m.actionId);
    c.waiters = c.waiters.filter((w) => !w());
  };
  c.closed = new Promise((res) => (ws.onclose = (e) => res(e.code)));
  c.open = new Promise((res) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', token })); res(); }));
  c.until = (pred, ms = 3000) => new Promise((res, rej) => {
    if (pred()) return res();
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(t); res(); return true; } return false; });
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}

const created = await post('/api/rooms', { name: 'Host' });
check(created.status === 200 && /^[A-Z2-9]{5}$/.test(created.body.code), `create room ${created.body.code}`);
const code = created.body.code;
const tokens = [created.body.token];
for (let i = 1; i < N; i++) {
  const j = await post(`/api/rooms/${code}/join`, { name: `P${i}` });
  check(j.status === 200, `join P${i}`);
  tokens.push(j.body.token);
}
check((await post(`/api/rooms/${code}/join`, { name: 'Host' })).status === 409, 'duplicate nickname rejected');
check((await post('/api/rooms/ZZZZZ/join', { name: 'x' })).status === 404, 'unknown room 404');

const bad = client(code, 'f'.repeat(32));
check((await bad.closed) === 4001, 'wrong token rejected (code alone is not identity)');

const clients = tokens.map((t) => client(code, t));
await Promise.all(clients.map((c) => c.until(() => c.room && c.room.players.filter((p) => p.connected).length === N)));
check(true, `${N} clients connected and see each other online`);

clients[1].send({ t: 'start' });
await clients[1].until(() => clients[1].errors.length > 0);
check(clients[1].errors.at(-1).includes('หัวห้อง'), 'non-host cannot start');

clients[0].send({ t: 'start' });
await Promise.all(clients.map((c) => c.until(() => c.room?.status === 'playing')));
check(clients.every((c) => c.room.game.deckMode === 'DEMO_ONLY'), 'game started in DEMO_ONLY mode for everyone');
check(clients.every((c) => c.room.game.decks === undefined && c.room.game.rngState === undefined), 'hidden deck/rng not leaked');

const byPid = (pid) => clients.find((c) => c.playerId === pid);
let n = 0;
async function act(action, who) {
  const g = clients[0].room.game;
  const c = who ?? byPid(g.players[g.activeIndex].id);
  const id = `a${++n}-${Math.random()}`;
  const errs = c.errors.length;
  c.send({ t: 'action', actionId: id, expectedVersion: c.room.version, action });
  await c.until(() => c.acks.includes(id) || c.errors.length > errs);
  if (c.errors.length > errs) console.log('  action error:', c.errors.at(-1));
  await Promise.all(clients.map((x) => x.until(() => x.room.version === c.room.version)));
  return id;
}

// wrong player acting
{
  const g = clients[0].room.game;
  const other = clients.find((c) => c.playerId !== g.players[g.activeIndex].id);
  const before = other.errors.length;
  other.send({ t: 'action', actionId: 'x1', expectedVersion: other.room.version, action: { type: 'pass' } });
  await other.until(() => other.errors.length > before);
  check(other.errors.at(-1) === 'ยังไม่ถึงเทิร์นของคุณ', 'other player cannot act for active player');
}

for (let i = 0; i < 3 * N; i++) await act({ type: 'pass' });
check(clients[0].room.game.phase === 'roll', 'setup rounds complete -> roll phase');

// stale version + idempotent retry
{
  const g = clients[0].room.game;
  const c = byPid(g.players[g.activeIndex].id);
  c.send({ t: 'action', actionId: 'stale', expectedVersion: c.room.version - 1, action: { type: 'roll', dice: 1 } });
  await c.until(() => c.errors.at(-1)?.includes('เปลี่ยนแปลง'));
  check(true, 'stale expectedVersion rejected');
  const id = await act({ type: 'roll', dice: 2 }, c);
  const v = c.room.version;
  c.send({ t: 'action', actionId: id, expectedVersion: v, action: { type: 'roll', dice: 2 } });
  await new Promise((r) => setTimeout(r, 300));
  check(c.room.version === v && c.acks.filter((a) => a === id).length === 2, 'duplicate actionId is acked but not re-applied');
  check(clients.every((x) => JSON.stringify(x.room.game.lastRoll) === JSON.stringify(c.room.game.lastRoll)), `all clients see same roll ${c.room.game.lastRoll?.dice}`);
}

// play some turns
for (let t = 0; t < 12 && clients[0].room.game.phase !== 'ended'; t++) {
  const g = clients[0].room.game;
  if (g.phase === 'roll') await act({ type: 'roll', dice: t % 2 ? 1 : 2 });
  else if (g.phase === 'choice') await act(g.pending[0].kind === 'business_center' ? { type: 'skip_exchange' } : { type: 'give', cardId: Object.keys(g.players[g.activeIndex].establishments)[0] });
  else {
    const p = g.players[g.activeIndex];
    const affordable = g.market.low.concat(g.market.high).find((m) => true && p.coins >= 1);
    await act(affordable && p.coins >= 3 ? { type: 'build', cardId: affordable.cardId } : { type: 'pass' });
  }
}
check(clients.every((x) => x.room.version === clients[0].room.version), `after turns all clients at version ${clients[0].room.version}`);

// reconnect: drop client 1 and reconnect with the same token
clients[1].ws.close();
await clients[0].until(() => clients[0].room.players.filter((p) => p.connected).length === N - 1);
check(true, 'disconnect shows player offline');
const re = client(code, tokens[1]);
await re.until(() => re.room && re.playerId === clients[1].playerId);
check(re.room.players.length === N, 'reconnect restores same player without creating a new one');
await clients[0].until(() => clients[0].room.players.filter((p) => p.connected).length === N);
check(true, 'player shown online again');

for (const c of [...clients, re]) c.ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
