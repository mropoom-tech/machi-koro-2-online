import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, BotLevel, CreateRoomResponse, JoinRoomResponse, MsgParams, RoomView, ServerMessage } from '@mk2/game-engine';
import type { UiKey } from './i18n';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';

export interface Session { code: string; token: string; playerId: string; name: string }

const key = (code: string) => `mk2:session:${code}`;

// sessionStorage keeps each browser tab its own seat (and survives refresh);
// localStorage lets the player come back after closing the tab.
export function loadSession(code: string): Session | null {
  try {
    const raw = sessionStorage.getItem(key(code)) ?? localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}
export function saveSession(s: Session) {
  try {
    sessionStorage.setItem(key(s.code), JSON.stringify(s));
    localStorage.setItem(key(s.code), JSON.stringify(s));
  } catch { /* storage unavailable */ }
}
export function clearSession(code: string) {
  try { sessionStorage.removeItem(key(code)); localStorage.removeItem(key(code)); } catch { /* ignore */ }
}
export function savedName(): string {
  try { return localStorage.getItem('mk2:name') ?? ''; } catch { return ''; }
}
export function rememberName(n: string) {
  try { localStorage.setItem('mk2:name', n); } catch { /* ignore */ }
}

/** A message to show the user: either a server message key or a UI string key. */
export type Note = { id: number; server?: string; ui?: UiKey; params?: MsgParams };

/** Thrown by REST calls; `code` is a server message key (or 'net_error' / 'generic_error'). */
export class ApiError extends Error {
  constructor(public code: string, public params: MsgParams = {}) { super(code); }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('net_error');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as any).error ?? 'generic_error', (data as any).params ?? {});
  return data as T;
}

export const createRoom = (name: string, bots?: { bots: number; botLevel: BotLevel }) =>
  post<CreateRoomResponse>('/api/rooms', { name, ...bots });
export const joinRoom = (code: string, name: string, spectate = false) =>
  post<JoinRoomResponse>(`/api/rooms/${code}/join`, { name, spectate });

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'failed';

/** Keeps one authenticated WebSocket per room, with automatic reconnect and exponential backoff. */
export function useRoom(session: Session | null) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [toast, setToast] = useState<Note | null>(null);
  const [fatal, setFatal] = useState<Note | null>(null);
  const [cardTicket, setCardTicket] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [emotes, setEmotes] = useState<Record<string, { e: string; id: number }>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  roomRef.current = room;

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      setConn(attempt === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/api/rooms/${session.code}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'hello', token: session.token }));
        ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 25_000);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data) as ServerMessage;
        if (m.t === 'welcome') { attempt = 0; setConn('open'); setCardTicket(m.cardTicket); }
        else if (m.t === 'room') setRoom(m.room);
        else if (m.t === 'emote') setEmotes((x) => ({ ...x, [m.playerId]: { e: m.e, id: Date.now() } }));
        else if (m.t === 'notice') setToast({ id: Date.now(), server: m.key, params: m.params });
        else if (m.t === 'error') {
          const note: Note = { id: Date.now(), server: m.code, params: m.params };
          if (m.fatal) { stopped = true; setFatal(note); ws.close(); }
          else setToast(note);
        }
      };
      ws.onclose = (e) => {
        clearInterval(ping);
        if (stopped) return;
        if (e.code === 4002) { stopped = true; setLeft(true); return; } // left the room on purpose
        if (e.code === 4005) { stopped = true; clearSession(session.code); setLeft(true); return; } // forfeited
        if (e.code === 4003 || e.code === 4004) {
          stopped = true;
          clearSession(session.code);
          setFatal({ id: Date.now(), ui: e.code === 4003 ? 'fatal_kicked' : 'fatal_removed' });
          setConn('failed');
          return;
        }
        if (e.code === 4001 || e.code === 4000) {
          setFatal(e.code === 4001 ? { id: Date.now(), server: 'err_auth_failed' } : { id: Date.now(), ui: 'fatal_expired' });
          setConn('failed');
          return;
        }
        attempt++;
        setConn('reconnecting');
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempt, 5)));
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wsRef.current?.readyState === WebSocket.CLOSED && !stopped) {
        clearTimeout(timer); attempt = 0; connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, [session?.code, session?.token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setToast({ id: Date.now(), ui: 'wait_reconnect' });
  }, []);

  const act = useCallback((action: Action) => {
    const r = roomRef.current;
    if (!r) return;
    send({ t: 'action', actionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, expectedVersion: r.version, action });
  }, [send]);

  const start = useCallback(() => send({ t: 'start' }), [send]);
  const leave = useCallback(() => send({ t: 'leave' }), [send]);
  const transferHost = useCallback((playerId: string) => send({ t: 'transfer_host', playerId }), [send]);
  const kick = useCallback((playerId: string) => send({ t: 'kick', playerId }), [send]);
  const skipTurn = useCallback(() => send({ t: 'skip_turn' }), [send]);
  const forfeit = useCallback(() => send({ t: 'forfeit' }), [send]);
  const removePlayer = useCallback((playerId: string) => send({ t: 'remove_player', playerId }), [send]);
  const addBot = useCallback((level: BotLevel) => send({ t: 'add_bot', level }), [send]);
  const replaceWithBot = useCallback((playerId: string) => send({ t: 'replace_with_bot', playerId }), [send]);
  const setTurnTimer = useCallback((seconds: number) => send({ t: 'set_turn_timer', seconds }), [send]);
  const emote = useCallback((e: string) => send({ t: 'emote', e }), [send]);
  const rematch = useCallback(() => send({ t: 'rematch' }), [send]);
  const setSpectator = useCallback((spectator: boolean) => send({ t: 'set_spectator', spectator }), [send]);

  return { room, conn, toast, fatal, left, cardTicket, act, start, leave, transferHost, kick, skipTurn, removePlayer, forfeit, addBot, setSpectator,
    replaceWithBot, setTurnTimer, emote, rematch, emotes };
}

/** URL of a (non-public) card image, readable only with this room's signed ticket. */
export function cardImageUrl(ticket: string | null, lang: 'th' | 'en', cardId: string): string | null {
  return ticket ? `${API_URL}/cards/${lang}/${cardId}.webp?t=${encodeURIComponent(ticket)}` : null;
}
