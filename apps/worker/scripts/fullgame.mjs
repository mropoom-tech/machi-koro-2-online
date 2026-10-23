// Plays complete games through the real server with simple bots until someone wins.
// Usage: node apps/worker/scripts/fullgame.mjs [baseUrl] [players]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const N = Number(process.argv[3] ?? 4);
const WS = BASE.replace(/^http/, 'ws');

const post = async (path, body) =>
  (await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

function client(code, token) {
  const ws = new WebSocket(`${WS}/api/rooms/${code}/ws`);
  const c = { ws, room: null, id: null, lastErr: null, acks: new Set(), wake: () => {} };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'welcome') c.id = m.playerId;
    if (m.t === 'ack') c.acks.add(m.actionId);
    if (m.t === 'error') c.lastErr = m;
    c.wake();
  };
  c.request = async (action) => {
    for (;;) {
      const ok = await c.once(action);
      if (ok || !c.lastErr?.message.includes('เร็วเกินไป')) return ok;
      await new Promise((r) => setTimeout(r, 400));
    }
  };
  c.once = (action) => new Promise((res) => {
    const actionId = Math.random().toString(36).slice(2);
    c.lastErr = null;
    c.wake = () => { if (c.acks.has(actionId)) res(true); else if (c.lastErr) res(false); };
    ws.send(JSON.stringify({ t: 'action', actionId, expectedVersion: c.room.version, action }));
  });
  return c;
}

const { code, token } = await post('/api/rooms', { name: 'Bot0' });
const tokens = [token];
for (let i = 1; i < N; i++) tokens.push((await post(`/api/rooms/${code}/join`, { name: `Bot${i}` })).token);
const cs = tokens.map((t) => client(code, t));
while (cs.some((c) => !c.id || !c.room)) await new Promise((r) => setTimeout(r, 50));
cs[0].ws.send(JSON.stringify({ t: 'start' }));
while (cs[0].room.status !== 'playing') await new Promise((r) => setTimeout(r, 50));

let actions = 0;
const seen = new Set();
while (cs[0].room.game.phase !== 'ended' && actions < 3000) {
  const g = cs[0].room.game;
  const me = g.players[g.activeIndex];
  const c = cs.find((x) => x.id === me.id);
  while (c.room.version !== cs[0].room.version) await new Promise((r) => setTimeout(r, 5));
  actions++;
  if (g.phase === 'roll') { await c.request({ type: 'roll', dice: me.establishments && Object.keys(me.establishments).length > 4 ? 2 : 1 }); continue; }
  if (g.phase === 'choice') {
    const pc = g.pending[0];
    seen.add(pc.kind);
    await c.request(pc.kind === 'business_center' ? { type: 'skip_exchange' } : { type: 'give', cardId: Object.keys(me.establishments)[0] });
    continue;
  }
  let done = false;
  if (g.phase === 'build' && me.coins >= 8) for (const m of g.market.landmark) if (!done && (await c.request({ type: 'build', cardId: m.cardId }))) { done = true; seen.add(m.cardId); }
  const ests = [...g.market.low, ...g.market.high].sort(() => Math.random() - 0.5);
  const wantSave = me.coins >= 4 && g.turn > 6;
  for (const m of ests) if (!done && !wantSave && me.coins >= 3 && (await c.request({ type: 'build', cardId: m.cardId }))) done = true;
  if (!done) await c.request({ type: 'pass' });
}
await new Promise((r) => setTimeout(r, 200));
const g = cs[0].room.game;
const winner = g.players.find((p) => p.id === g.winnerId);
console.log(`room ${code}: ${actions} actions, turn ${g.turn}, phase=${g.phase}, status=${cs[0].room.status}`);
console.log(`winner: ${winner?.name} with landmarks [${winner?.landmarks.join(', ')}]`);
console.log(`special prompts seen: ${[...seen].join(', ')}`);
console.log(g.log.slice(-4).map((l) => '  ' + l.text).join('\n'));
const blocked = !(await cs[0].request({ type: 'pass' })) && !(await cs[1].request({ type: 'roll', dice: 1 }));
console.log(blocked ? 'PASS  actions rejected after game end' : 'FAIL  actions accepted after end');
const sync = cs.every((c) => c.room.version === cs[0].room.version && c.room.game.winnerId === g.winnerId);
console.log(sync ? 'PASS  all clients agree on final state' : 'FAIL  clients diverged');
cs.forEach((c) => c.ws.close());
process.exit(g.phase === 'ended' && blocked && sync ? 0 : 1);
