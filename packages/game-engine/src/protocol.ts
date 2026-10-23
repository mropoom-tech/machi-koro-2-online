import type { Action, PublicGameState } from './engine';
import type { DeckMode } from './decks';
import type { MsgParams } from './i18n';
import { BOT_LEVELS, type BotLevel } from './bot';

export interface LobbyPlayer {
  id: string; name: string; connected: boolean; isHost: boolean;
  /** consecutive turns skipped while disconnected */
  missedTurns: number;
  isBot: boolean;
  botLevel: BotLevel | null;
  /** watching only: not seated in the game */
  spectator: boolean;
}

export const MAX_SPECTATORS = 20;
/** Turn time limits the host can pick (seconds; 0 = no limit). */
export const TURN_TIMER_OPTIONS = [0, 60, 90, 120];
export const EMOTES = ['👍', '👏', '😂', '😮', '😭', '😡', '🎉', '🤔'];

export const MAX_MISSED_TURNS = 3;

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  hostId: string;
  players: LobbyPlayer[];
  version: number;
  deckMode: DeckMode;
  game: PublicGameState | null;
  /** server time (ms) when the disconnected active player will be skipped automatically */
  autoSkipAt: number | null;
  /** seconds per turn (0 = no limit) */
  turnSeconds: number;
  /** server time (ms) when the active player's turn runs out, if a limit is set */
  turnDeadline: number | null;
  serverNow: number;
}

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'transfer_host'; playerId: string }
  | { t: 'kick'; playerId: string }
  | { t: 'skip_turn' }
  | { t: 'remove_player'; playerId: string }
  | { t: 'forfeit' }
  | { t: 'add_bot'; level: BotLevel }
  | { t: 'replace_with_bot'; playerId: string }
  | { t: 'set_turn_timer'; seconds: number }
  | { t: 'emote'; e: string }
  | { t: 'rematch' }
  | { t: 'set_spectator'; spectator: boolean }
  | { t: 'action'; actionId: string; expectedVersion: number; action: Action }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; playerId: string; cardTicket: string | null }
  | { t: 'room'; room: RoomView }
  | { t: 'ack'; actionId: string }
  | { t: 'error'; code: string; params?: MsgParams; actionId?: string; fatal?: boolean }
  | { t: 'notice'; key: string; params: MsgParams }
  | { t: 'emote'; playerId: string; e: string }
  | { t: 'pong' };

export interface CreateRoomResponse { code: string; token: string; playerId: string }
export interface JoinRoomResponse { token: string; playerId: string }

const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return name.length > 0 ? name : null;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

function parseAction(a: any): Action | null {
  if (!a || typeof a !== 'object') return null;
  switch (a.type) {
    case 'roll': return a.dice === 1 || a.dice === 2 ? { type: 'roll', dice: a.dice } : null;
    case 'build': return isStr(a.cardId) ? { type: 'build', cardId: a.cardId } : null;
    case 'pass': return { type: 'pass' };
    case 'skip_exchange': return { type: 'skip_exchange' };
    case 'give': return isStr(a.cardId) ? { type: 'give', cardId: a.cardId } : null;
    case 'exchange':
      return isStr(a.giveCardId) && isStr(a.targetPlayerId) && isStr(a.takeCardId)
        ? { type: 'exchange', giveCardId: a.giveCardId, targetPlayerId: a.targetPlayerId, takeCardId: a.takeCardId }
        : null;
    default: return null;
  }
}

/** Validates an untrusted client message. Never trust anything else the client sends. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 2000) return null;
  let m: any;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'hello': return isStr(m.token, 128) ? { t: 'hello', token: m.token } : null;
    case 'start': return { t: 'start' };
    case 'leave': return { t: 'leave' };
    case 'transfer_host': return isStr(m.playerId) ? { t: 'transfer_host', playerId: m.playerId } : null;
    case 'kick': return isStr(m.playerId) ? { t: 'kick', playerId: m.playerId } : null;
    case 'skip_turn': return { t: 'skip_turn' };
    case 'forfeit': return { t: 'forfeit' };
    case 'add_bot': return BOT_LEVELS.includes(m.level) ? { t: 'add_bot', level: m.level } : null;
    case 'replace_with_bot': return isStr(m.playerId) ? { t: 'replace_with_bot', playerId: m.playerId } : null;
    case 'set_turn_timer': return TURN_TIMER_OPTIONS.includes(m.seconds) ? { t: 'set_turn_timer', seconds: m.seconds } : null;
    case 'emote': return EMOTES.includes(m.e) ? { t: 'emote', e: m.e } : null;
    case 'rematch': return { t: 'rematch' };
    case 'set_spectator': return typeof m.spectator === 'boolean' ? { t: 'set_spectator', spectator: m.spectator } : null;
    case 'remove_player': return isStr(m.playerId) ? { t: 'remove_player', playerId: m.playerId } : null;
    case 'ping': return { t: 'ping' };
    case 'action': {
      const action = parseAction(m.action);
      if (!action || !isStr(m.actionId) || !Number.isInteger(m.expectedVersion)) return null;
      return { t: 'action', actionId: m.actionId, expectedVersion: m.expectedVersion, action };
    }
    default: return null;
  }
}
