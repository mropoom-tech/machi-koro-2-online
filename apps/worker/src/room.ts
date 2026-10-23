import { DurableObject } from 'cloudflare:workers';
import {
  applyAction, botAction, createGame, DEMO_DECK, forceSkipTurn, removePlayer, MAX_MISSED_TURNS, MAX_PLAYERS, MAX_SPECTATORS, MIN_PLAYERS, parseClientMessage, sanitizeName, toPublic, verifiedDeck,
  type DeckManifest, type GameState, type MsgParams, type RoomView, type ServerMessage,
} from '@mk2/game-engine';
import type { Env } from './index';
import { issueCardTicket } from './tickets';

interface StoredPlayer { id: string; name: string; tokenHash: string; bot?: boolean; spectator?: boolean }
interface Meta {
  code: string; hostId: string; status: RoomView['status']; version: number; createdAt: number;
  expiresAt?: number;
  /** set while the host has no open socket; used for automatic host handover */
  hostOfflineSince?: number | null;
  /** playerId -> time their last socket closed (absent while connected) */
  offlineSince?: Record<string, number>;
  turnKey?: string;
  /** playerId -> consecutive turns skipped */
  skipStreak?: Record<string, number>;
  turnStartedAt?: number;
  /** when the active bot makes its next move */
  botAt?: number | null;
}
interface Attachment { playerId: string | null }

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSED_LIMIT = 200;
const HOST_GRACE_MS = 30 * 1000;
const AUTO_SKIP_MS = 45 * 1000;
// long enough for clients to show the dice before the next bot move
const BOT_DELAY_MS = 2200;

function randomHex(bytes: number): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** One Durable Object per room. All critical state is persisted to SQLite-backed storage before broadcast. */
export class GameRoom extends DurableObject<Env> {
  private meta: Meta | null = null;
  private players: StoredPlayer[] = [];
  private game: GameState | null = null;
  private processed: string[] = [];
  // in-memory only; resets when the object hibernates, which is acceptable for a soft rate limit
  private closing: WebSocket | null = null;
  private rate = new Map<WebSocket, { tokens: number; at: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const m = await ctx.storage.get<any>(['meta', 'players', 'game', 'processed']);
      this.meta = (m.get('meta') as Meta) ?? null;
      this.players = (m.get('players') as StoredPlayer[]) ?? [];
      this.game = (m.get('game') as GameState) ?? null;
      this.processed = (m.get('processed') as string[]) ?? [];
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private async persist() {
    if (this.meta) {
      this.meta.expiresAt = Date.now() + ROOM_TTL_MS;
      if (this.game) {
        // Each new turn gets a fresh grace period before an offline player is skipped.
        const key = `${this.game.turn}:${this.game.activeIndex}:${this.game.setupRound}`;
        if (key !== this.meta.turnKey) { this.meta.turnKey = key; this.meta.turnStartedAt = Date.now(); }
      }
      const g = this.game;
      const bot = this.meta.status === 'playing' && g && this.players.find((p) => p.id === g.players[g.activeIndex]?.id)?.bot;
      this.meta.botAt = bot ? Date.now() + BOT_DELAY_MS : null;
    }
    await this.ctx.storage.put({ meta: this.meta, players: this.players, game: this.game, processed: this.processed });
    await this.scheduleAlarm();
  }

  /** One alarm serves two jobs: room expiry and the host-offline handover check. */
  private async scheduleAlarm() {
    if (!this.meta) return;
    const times = [this.meta.expiresAt ?? Date.now() + ROOM_TTL_MS];
    if (this.meta.hostOfflineSince) times.push(this.meta.hostOfflineSince + HOST_GRACE_MS);
    const skipAt = this.autoSkipAt();
    if (skipAt) times.push(skipAt);
    if (this.meta.botAt) times.push(this.meta.botAt);
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  private activeOfflineSince(): number | null {
    if (!this.meta || !this.game || this.meta.status !== 'playing') return null;
    const id = this.game.players[this.game.activeIndex]?.id;
    return (id && this.meta.offlineSince?.[id]) || null;
  }

  private autoSkipAt(): number | null {
    const since = this.activeOfflineSince();
    if (!since) return null;
    return Math.max(since, this.meta!.turnStartedAt ?? 0) + AUTO_SKIP_MS;
  }

  private async skipActive() {
    const pid = this.game!.players[this.game!.activeIndex].id;
    this.game = forceSkipTurn(this.game!);
    const m = this.meta!;
    m.skipStreak = { ...m.skipStreak, [pid]: (m.skipStreak?.[pid] ?? 0) + 1 };
    m.version++;
    if (m.skipStreak[pid] >= MAX_MISSED_TURNS) {
      return this.removeFromGame(pid, 'r_skipped');
    }
    await this.persist();
    this.broadcastRoom();
  }

  /** Removes a player from the running game and from the room; their token stops working. */
  private async removeFromGame(pid: string, reason: string, forfeit = false) {
    const m = this.meta!;
    const name = this.players.find((p) => p.id === pid)?.name ?? '';
    this.game = removePlayer(this.game!, pid, forfeit ? 'forfeit' : 'removed');
    this.players = this.players.filter((p) => p.id !== pid);
    if (m.offlineSince) delete m.offlineSince[pid];
    if (m.skipStreak) delete m.skipStreak[pid];
    for (const s of this.ctx.getWebSockets()) {
      if ((s.deserializeAttachment() as Attachment | null)?.playerId === pid) {
        s.serializeAttachment({ playerId: null } satisfies Attachment);
        s.close(forfeit ? 4005 : 4004, forfeit ? 'forfeit' : 'removed');
      }
    }
    if (this.game.phase === 'ended') m.status = 'ended';
    m.version++;
    if (forfeit) this.notice('n_forfeit', { p: name });
    else this.notice('n_removed', { p: name, reason, n: MAX_MISSED_TURNS });
    if (m.hostId === pid) this.pickNewHost();
    await this.persist();
    this.broadcastRoom();
  }

  private async wipe() {
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, 'room expired');
    await this.ctx.storage.deleteAll();
    this.meta = null; this.players = []; this.game = null; this.processed = [];
  }

  async alarm() {
    if (!this.meta) return;
    const now = Date.now();
    if (now >= (this.meta.expiresAt ?? 0)) return this.wipe(); // expired from inactivity
    if (this.meta.botAt && now >= this.meta.botAt) return this.botMove();
    const skipAt = this.autoSkipAt();
    if (skipAt && now >= skipAt) {
      await this.skipActive();
      return;
    }
    const since = this.meta.hostOfflineSince;
    if (since && now - since >= HOST_GRACE_MS) {
      const online = this.connectedIds();
      if (online.has(this.meta.hostId)) this.meta.hostOfflineSince = null;
      else {
        const next = this.players.find((p) => online.has(p.id));
        if (next) this.setHost(next.id, 'auto');
        else this.meta.hostOfflineSince = null; // nobody online; re-check when someone disconnects again
      }
      await this.persist();
      this.broadcastRoom();
      return;
    }
    await this.scheduleAlarm();
  }

  private async botMove() {
    const g = this.game;
    if (!g || this.meta!.status !== 'playing') { this.meta!.botAt = null; return this.scheduleAlarm(); }
    const r = applyAction(g, g.players[g.activeIndex].id, botAction(g));
    this.game = r.ok ? r.state : forceSkipTurn(g);
    if (this.game.phase === 'ended') this.meta!.status = 'ended';
    this.meta!.version++;
    await this.persist();
    this.broadcastRoom();
  }

  private humans() { return this.players.filter((p) => !p.bot); }
  private seated() { return this.players.filter((p) => !p.spectator); }

  /** Hands the host role to an online human (or any human) after the host leaves. */
  private pickNewHost() {
    const online = this.connectedIds();
    const next = this.humans().find((p) => online.has(p.id)) ?? this.humans()[0];
    if (next) this.setHost(next.id, 'left');
  }

  private setHost(playerId: string, reason: 'auto' | 'manual' | 'left') {
    const m = this.meta!;
    if (m.hostId === playerId) return;
    m.hostId = playerId;
    m.hostOfflineSince = null;
    m.version++;
    const name = this.players.find((p) => p.id === playerId)?.name ?? '';
    const why = reason === 'auto' ? 'why_auto' : reason === 'left' ? 'why_left' : '';
    this.notice('n_new_host', { p: name, why });
  }

  private notice(key: string, params: MsgParams) {
    const data = JSON.stringify({ t: 'notice', key, params } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.playerId) try { ws.send(data); } catch { /* ignore */ }
    }
  }

  private deck(): DeckManifest {
    return verifiedDeck() ?? DEMO_DECK;
  }

  private async addPlayer(name: string, spectator = false): Promise<{ token: string; playerId: string }> {
    const token = randomHex(16); // 128-bit bearer secret; only its hash is stored
    const playerId = randomHex(6);
    this.players.push({ id: playerId, name, tokenHash: await sha256(token), ...(spectator ? { spectator: true } : {}) });
    return { token, playerId };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get('code') ?? '';

    if (url.pathname === '/create' && req.method === 'POST') {
      if (this.meta) return json({ error: 'exists' }, 409);
      const name = sanitizeName(((await req.json()) as any)?.name);
      if (!name) return json({ error: 'err_need_name' }, 400);
      const { token, playerId } = await this.addPlayer(name);
      this.meta = { code, hostId: playerId, status: 'lobby', version: 1, createdAt: Date.now() };
      await this.persist();
      return json({ code, token, playerId });
    }

    if (!this.meta) return json({ error: 'err_room_not_found' }, 404);

    if (url.pathname === '/join' && req.method === 'POST') {
      const body = (await req.json()) as any;
      const name = sanitizeName(body?.name);
      const spectate = body?.spectate === true;
      if (!name) return json({ error: 'err_need_name' }, 400);
      if (spectate) {
        if (this.players.filter((p) => p.spectator).length >= MAX_SPECTATORS) {
          return json({ error: 'err_spectators_full', params: { max: MAX_SPECTATORS } }, 409);
        }
      } else {
        if (this.meta.status !== 'lobby') return json({ error: 'err_game_started_join' }, 409);
        if (this.seated().length >= MAX_PLAYERS) return json({ error: 'err_room_full', params: { max: MAX_PLAYERS } }, 409);
      }
      if (this.players.some((p) => p.name === name)) return json({ error: 'err_name_taken' }, 409);
      const res = await this.addPlayer(name, spectate);
      this.meta.version++;
      await this.persist();
      this.broadcastRoom();
      return json(res);
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ playerId: null } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return json({ error: 'not found' }, 404);
  }

  // ------------------------------------------------------------ websocket

  private send(ws: WebSocket, msg: ServerMessage) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ }
  }

  private connectedIds(): Set<string> {
    const s = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === this.closing || ws.readyState > 1) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.playerId) s.add(a.playerId);
    }
    return s;
  }

  private view(): RoomView {
    const m = this.meta!;
    const online = this.connectedIds();
    return {
      code: m.code,
      status: m.status,
      hostId: m.hostId,
      version: m.version,
      deckMode: this.game?.deckMode ?? this.deck().mode,
      autoSkipAt: this.autoSkipAt(),
      serverNow: Date.now(),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, connected: !!p.bot || online.has(p.id), isHost: p.id === m.hostId,
        missedTurns: m.skipStreak?.[p.id] ?? 0, isBot: !!p.bot, spectator: !!p.spectator,
      })),
      game: this.game ? toPublic(this.game) : null,
    };
  }

  private broadcastRoom() {
    const msg: ServerMessage = { t: 'room', room: this.view() };
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.playerId) try { ws.send(data); } catch { /* ignore */ }
    }
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.rate.get(ws) ?? { tokens: 20, at: now };
    b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 5);
    b.at = now;
    this.rate.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string') return;
    if (!this.allow(ws)) return this.send(ws, { t: 'error', code: 'err_rate' });
    const msg = parseClientMessage(raw);
    if (!msg) return this.send(ws, { t: 'error', code: 'err_bad_message' });
    if (!this.meta) return this.send(ws, { t: 'error', code: 'err_room_not_found', fatal: true });

    const att = (ws.deserializeAttachment() as Attachment | null) ?? { playerId: null };

    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });

    if (msg.t === 'hello') {
      const hash = await sha256(msg.token);
      const p = this.players.find((x) => x.tokenHash === hash);
      if (!p) {
        this.send(ws, { t: 'error', code: 'err_auth_failed', fatal: true });
        return ws.close(4001, 'unauthorized');
      }
      ws.serializeAttachment({ playerId: p.id } satisfies Attachment);
      this.send(ws, { t: 'welcome', playerId: p.id, cardTicket: await issueCardTicket(this.env.CARD_SIGNING_KEY, this.meta.code) });
      let dirty = false;
      if (p.id === this.meta.hostId && this.meta.hostOfflineSince) { this.meta.hostOfflineSince = null; dirty = true; }
      if (this.meta.offlineSince?.[p.id]) { delete this.meta.offlineSince[p.id]; dirty = true; }
      if (this.meta.skipStreak?.[p.id]) { delete this.meta.skipStreak[p.id]; dirty = true; }
      if (dirty) { await this.ctx.storage.put('meta', this.meta); await this.scheduleAlarm(); }
      this.broadcastRoom();
      return;
    }

    const playerId = att.playerId;
    if (!playerId) return this.send(ws, { t: 'error', code: 'err_not_authed' });

    if (msg.t === 'transfer_host') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_transfer' });
      if (!this.players.some((p) => p.id === msg.playerId) || msg.playerId === playerId) {
        return this.send(ws, { t: 'error', code: 'err_bad_target' });
      }
      this.setHost(msg.playerId, 'manual');
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'add_bot') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_bot' });
      if (this.meta.status !== 'lobby') return this.send(ws, { t: 'error', code: 'err_already_started' });
      if (this.seated().length >= MAX_PLAYERS) return this.send(ws, { t: 'error', code: 'err_room_full', params: { max: MAX_PLAYERS } });
      let n = 1;
      while (this.players.some((p) => p.name === `Bot ${n}`)) n++;
      // Bots have no token: the empty hash never matches a real one.
      this.players.push({ id: randomHex(6), name: `Bot ${n}`, tokenHash: '', bot: true });
      this.meta.version++;
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'set_spectator') {
      if (this.meta.status !== 'lobby') return this.send(ws, { t: 'error', code: 'err_seat_lobby_only' });
      const me = this.players.find((p) => p.id === playerId)!;
      if (!!me.spectator === msg.spectator) return;
      if (!msg.spectator && this.seated().length >= MAX_PLAYERS) {
        return this.send(ws, { t: 'error', code: 'err_room_full', params: { max: MAX_PLAYERS } });
      }
      if (msg.spectator && this.players.filter((p) => p.spectator).length >= MAX_SPECTATORS) {
        return this.send(ws, { t: 'error', code: 'err_spectators_full', params: { max: MAX_SPECTATORS } });
      }
      if (msg.spectator) me.spectator = true; else delete me.spectator;
      this.meta.version++;
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'kick') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_kick' });
      const target = this.players.find((p) => p.id === msg.playerId);
      // Seated players are part of the game once it starts; spectators can be removed any time.
      if (this.meta.status !== 'lobby' && !target?.spectator) return this.send(ws, { t: 'error', code: 'err_kick_lobby_only' });
      if (!target || target.id === playerId) return this.send(ws, { t: 'error', code: 'err_bad_target' });
      this.players = this.players.filter((p) => p.id !== target.id);
      for (const s of this.ctx.getWebSockets()) {
        if ((s.deserializeAttachment() as Attachment | null)?.playerId === target.id) {
          s.serializeAttachment({ playerId: null } satisfies Attachment);
          s.close(4003, 'kicked');
        }
      }
      this.meta.version++;
      this.notice('n_kicked', { p: target.name });
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'skip_turn') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_skip' });
      if (!this.activeOfflineSince()) return this.send(ws, { t: 'error', code: 'err_skip_offline_only' });
      await this.skipActive();
      return;
    }

    if (msg.t === 'forfeit') {
      if (this.meta.status !== 'playing' || !this.game) return this.send(ws, { t: 'error', code: 'err_forfeit_game_only' });
      if (!this.game.players.some((p) => p.id === playerId)) return this.send(ws, { t: 'error', code: 'err_spectator_only_watch' });
      await this.removeFromGame(playerId, 'forfeit', true);
      return;
    }

    if (msg.t === 'remove_player') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_remove' });
      if (this.meta.status !== 'playing' || !this.game) return this.send(ws, { t: 'error', code: 'err_remove_game_only' });
      if (msg.playerId === playerId || !this.game.players.some((p) => p.id === msg.playerId)) {
        return this.send(ws, { t: 'error', code: 'err_bad_target' });
      }
      if (this.connectedIds().has(msg.playerId)) return this.send(ws, { t: 'error', code: 'err_remove_offline_only' });
      await this.removeFromGame(msg.playerId, 'r_host_removed');
      return;
    }

    if (msg.t === 'leave') {
      const leaving = this.players.find((p) => p.id === playerId);
      if (this.meta.status !== 'lobby' && !leaving?.spectator) {
        // Seats are part of the game state once it starts; leaving just disconnects (the player can return).
        return ws.close(4002, 'left');
      }
      this.players = this.players.filter((p) => p.id !== playerId);
      for (const s of this.ctx.getWebSockets()) {
        if ((s.deserializeAttachment() as Attachment | null)?.playerId === playerId) {
          s.serializeAttachment({ playerId: null } satisfies Attachment);
          s.close(4002, 'left');
        }
      }
      if (this.humans().length === 0) return this.wipe();
      this.meta.version++;
      if (this.meta.hostId === playerId) this.pickNewHost();
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'start') {
      if (playerId !== this.meta.hostId) return this.send(ws, { t: 'error', code: 'err_host_only_start' });
      if (this.meta.status !== 'lobby') return this.send(ws, { t: 'error', code: 'err_already_started' });
      if (this.seated().length < MIN_PLAYERS) return this.send(ws, { t: 'error', code: 'err_min_players', params: { min: MIN_PLAYERS } });
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      this.game = createGame(this.seated().map(({ id, name }) => ({ id, name })), this.deck(), seed);
      this.meta.status = 'playing';
      this.meta.version++;
      await this.persist();
      this.broadcastRoom();
      return;
    }

    if (msg.t === 'action') {
      if (this.processed.includes(msg.actionId)) return this.send(ws, { t: 'ack', actionId: msg.actionId }); // idempotent retry
      if (!this.game) return this.send(ws, { t: 'error', code: 'err_not_started', actionId: msg.actionId });
      if (msg.expectedVersion !== this.meta.version) {
        this.send(ws, { t: 'error', code: 'err_stale', actionId: msg.actionId });
        return this.send(ws, { t: 'room', room: this.view() });
      }
      const r = applyAction(this.game, playerId, msg.action);
      if (!r.ok) return this.send(ws, { t: 'error', code: r.error, params: r.params, actionId: msg.actionId });
      this.game = r.state;
      if (r.state.phase === 'ended') this.meta.status = 'ended';
      this.meta.version++;
      this.processed.push(msg.actionId);
      if (this.processed.length > PROCESSED_LIMIT) this.processed.splice(0, this.processed.length - PROCESSED_LIMIT);
      await this.persist(); // persist before broadcasting the result
      this.broadcastRoom();
      this.send(ws, { t: 'ack', actionId: msg.actionId });
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.rate.delete(ws);
    try { ws.close(); } catch { /* already closed */ }
    this.closing = ws;
    if (this.meta) {
      const pid = (ws.deserializeAttachment() as Attachment | null)?.playerId;
      if (pid && !this.connectedIds().has(pid) && this.players.some((p) => p.id === pid)) {
        this.meta.offlineSince = { ...this.meta.offlineSince, [pid]: Date.now() };
        if (pid === this.meta.hostId && !this.meta.hostOfflineSince) this.meta.hostOfflineSince = Date.now();
        await this.ctx.storage.put('meta', this.meta);
        await this.scheduleAlarm();
      }
      this.broadcastRoom();
    }
    this.closing = null;
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
