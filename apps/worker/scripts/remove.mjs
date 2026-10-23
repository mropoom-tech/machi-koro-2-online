// Tests removing disconnected players from a running game (manual + automatic after 3 skips).
// Takes ~2.5 minutes because it waits for real auto-skip timers.
// Usage: node apps/worker/scripts/remove.mjs [baseUrl]
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
    if (m.t === 'error') c.errors.push(m.code);
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
const a = client(code, created.body.token), b = client(code, tB), c = client(code, tC);
await until(() => a.room?.players.filter((p) => p.connected).length === 3);
a.send({ t: 'start' });
await until(() => a.room.status === 'playing');

let err = b.lastError(); b.send({ t: 'remove_player', playerId: c.id });
check((await err) === 'err_host_only_remove', 'non-host cannot remove players');
err = a.lastError(); a.send({ t: 'remove_player', playerId: c.id });
check((await err) === 'err_remove_offline_only', 'cannot remove a connected player');

// --- manual removal of C
c.ws.close();
await until(() => a.room.players.find((p) => p.id === c.id)?.connected === false);
let v = a.room.version;
a.send({ t: 'remove_player', playerId: c.id });
await until(() => a.room.version > v && a.room.game.players.length === 2);
check(!a.room.players.some((p) => p.id === c.id), 'C removed from room and game');
check(a.room.game.log.some((l) => l.key === 'player_removed' && l.params.p === 'C'), 'removal logged');
check(a.room.game.phase !== 'ended', 'game continues with 2 players');
const reC = client(code, tC);
await until(() => reC.closeCode !== null);
check(reC.closeCode === 4001, 'removed player cannot reconnect');

// --- automatic removal of B after 3 consecutive skipped turns
b.ws.close();
await until(() => a.room.players.find((p) => p.id === b.id)?.connected === false);
const activeId = () => a.room.game.players[a.room.game.activeIndex].id;
console.log('      waiting for 3 automatic skips (45s each)…');
for (let i = 0; i < 4 && a.room.status === 'playing'; i++) {
  if (activeId() === a.id) {
    v = a.room.version;
    a.send({ t: 'action', actionId: `p${i}`, expectedVersion: a.room.version, action: { type: 'pass' } });
    await until(() => a.room.version > v);
  }
  v = a.room.version;
  await until(() => a.room.version > v, 55000);
  const missed = a.room.players.find((p) => p.id === b.id)?.missedTurns;
  console.log(`      B skipped — missedTurns=${missed ?? 'removed'}`);
}
check(a.room.status === 'ended' && a.room.game.winnerId === a.id, 'B auto-removed after 3 skips → A wins as last player');
check(a.room.game.log.at(-1).key === 'win', 'victory logged');

for (const x of [a, b, c, reC]) try { x.ws.close(); } catch {}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
