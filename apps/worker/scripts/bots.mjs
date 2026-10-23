// Tests bots: create-with-bots, replacing a disconnected player, emotes, turn timer setting, rematch.
// Usage: node apps/worker/scripts/bots.mjs [baseUrl]
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
    if (m.t === 'error') c.errors.push(m.code);
    if (m.t === 'notice') c.notices.push(m);
  };
  ws.onclose = (e) => (c.closeCode = e.code);
  c.send = (m) => ws.send(JSON.stringify(m));
  return c;
}


// Room created with bots
const r1 = await post('/api/rooms', { name: 'Solo', bots: 2, botLevel: 'hard' });
const s = client(r1.code, r1.token);
await until(() => s.room);
check(s.room.players.filter((p) => p.isBot && p.botLevel === 'hard').length === 2, 'room starts with 2 hard bots');
s.send({ t: 'set_turn_timer', seconds: 90 });
await until(() => s.room.turnSeconds === 90);
check(true, 'host sets the turn timer');
s.send({ t: 'emote', e: '🎉' });
let gotEmote = false;
s.ws.addEventListener('message', (e) => { if (JSON.parse(e.data).t === 'emote') gotEmote = true; });
await until(() => gotEmote);
check(gotEmote, 'emote is broadcast');
s.send({ t: 'emote', e: 'not-allowed' });
await until(() => s.errors.includes('err_bad_message'));
check(true, 'unknown emote rejected');
s.ws.close();

// Replace a disconnected player with a bot
const created = await post('/api/rooms', { name: 'A' });
const code = created.code;
const tB = (await post(`/api/rooms/${code}/join`, { name: 'B' })).token;
const a = client(code, created.token), b = client(code, tB);
await until(() => a.room?.players.filter((p) => p.connected).length === 2);
a.send({ t: 'start' });
await until(() => a.room.status === 'playing');
const bId = a.room.players.find((p) => p.name === 'B').id;
a.send({ t: 'replace_with_bot', playerId: bId });
await until(() => a.errors.includes('err_replace_offline_only'));
check(true, 'cannot replace an online player');
b.ws.close();
await until(() => a.room.players.find((p) => p.id === bId).connected === false);
a.send({ t: 'replace_with_bot', playerId: bId });
await until(() => a.room.players.find((p) => p.id === bId).isBot);
check(a.notices.some((n) => n.key === 'n_replaced_bot'), 'others are notified of the bot takeover');
const reB = client(code, tB);
await until(() => reB.closeCode !== null);
check(reB.closeCode === 4001, 'replaced player token no longer works');
// Play A's turns by passing/rolling until the game advances past the bot's turn a few times.
const startTurn = a.room.game.turn;
const deadline = Date.now() + 60000;
while (a.room.game.turn < startTurn + 6 && Date.now() < deadline) {
  const g = a.room.game;
  if (g.players[g.activeIndex].id === a.id) {
    const act = g.phase === 'roll' ? { type: 'roll', dice: 1 } : g.phase === 'choice' ? { type: 'skip_exchange' } : { type: 'pass' };
    a.send({ t: 'action', actionId: crypto.randomUUID(), expectedVersion: a.room.version, action: act });
  }
  await sleep(300);
}
check(a.room.game.turn >= startTurn + 6, 'the bot plays its turns');

for (const x of [a, b, reB]) try { x.ws.close(); } catch {}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
