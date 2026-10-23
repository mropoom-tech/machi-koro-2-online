import { getCard, getEst, getLandmark, type CardSymbol, type EstablishmentCard, type LandmarkCard } from './cards';
import type { DeckManifest } from './decks';
import { randInt, shuffle } from './rng';
import type { MsgParams } from './i18n';

export const STARTING_COINS = 5;
export const SETUP_ROUNDS = 3;
export const MARKET_SIZE = 5;
export const LANDMARKS_TO_WIN = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
const LOG_LIMIT = 80;

export type Row = 'low' | 'high' | 'landmark';
export const ROWS: Row[] = ['low', 'high', 'landmark'];

export interface PlayerState {
  id: string;
  name: string;
  coins: number;
  /** cardId -> copies owned */
  establishments: Record<string, number>;
  landmarks: string[];
}

export interface MarketSlot { cardId: string; count: number }

export type Phase = 'setup' | 'roll' | 'choice' | 'build' | 'ended';

export type PendingChoice =
  | { kind: 'business_center'; playerId: string }
  | { kind: 'moving_company'; playerId: string; toPlayerId: string };

export interface LogEntry {
  seq: number;
  /** message key in i18n.ts, rendered by each client in its own language */
  key: string;
  params: MsgParams;
  tone?: 'roll' | 'gain' | 'pay' | 'build' | 'info' | 'win';
}

export interface RollResult { dice: number[]; total: number; doubles: boolean }

export interface GameState {
  rngState: number;
  deckMode: DeckManifest['mode'];
  players: PlayerState[];
  firstPlayerIndex: number;
  activeIndex: number;
  setupRound: number; // 1..SETUP_ROUNDS while phase === 'setup'
  turn: number;
  phase: Phase;
  decks: Record<Row, string[]>;
  market: Record<Row, MarketSlot[]>;
  lastRoll: RollResult | null;
  builtThisTurn: boolean;
  extraTurn: boolean;
  pending: PendingChoice[];
  log: LogEntry[];
  logSeq: number;
  winnerId: string | null;
}

export type Action =
  | { type: 'roll'; dice: 1 | 2 }
  | { type: 'build'; cardId: string }
  | { type: 'pass' }
  | { type: 'exchange'; giveCardId: string; targetPlayerId: string; takeCardId: string }
  | { type: 'skip_exchange' }
  | { type: 'give'; cardId: string };

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string; params?: MsgParams };

export interface ApplyOptions {
  /** Test-only hook. The server never passes this; dice always come from the seeded RNG. */
  diceOverride?: number[];
}

// ---------------------------------------------------------------- setup

export function createGame(
  players: { id: string; name: string }[],
  deck: DeckManifest,
  seed: number,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error('err_players_count');
  }
  const s: GameState = {
    rngState: seed | 0,
    deckMode: deck.mode,
    players: players.map((p) => ({ id: p.id, name: p.name, coins: STARTING_COINS, establishments: {}, landmarks: [] })),
    firstPlayerIndex: 0,
    activeIndex: 0,
    setupRound: 1,
    turn: 1,
    phase: 'setup',
    decks: { low: [], high: [], landmark: [] },
    market: { low: [], high: [], landmark: [] },
    lastRoll: null,
    builtThisTurn: false,
    extraTurn: false,
    pending: [],
    log: [],
    logSeq: 0,
    winnerId: null,
  };
  for (const [cardId, n] of Object.entries(deck.copies)) {
    const row = rowOf(cardId);
    for (let i = 0; i < n; i++) s.decks[row].push(cardId);
  }
  for (const row of ROWS) {
    shuffle(s, s.decks[row]);
    refillRow(s, row);
  }
  s.firstPlayerIndex = randInt(s, s.players.length);
  s.activeIndex = s.firstPlayerIndex;
  log(s, 'game_start', { p: s.players[s.activeIndex].name, rounds: SETUP_ROUNDS }, 'info');
  return s;
}

export function rowOf(cardId: string): Row {
  const c = getCard(cardId);
  return c.type === 'landmark' ? 'landmark' : c.tier;
}

function refillRow(s: GameState, row: Row) {
  const slots = s.market[row];
  while (slots.length < MARKET_SIZE && s.decks[row].length > 0) {
    const cardId = s.decks[row].shift()!;
    const slot = slots.find((x) => x.cardId === cardId);
    if (slot) slot.count++;
    else slots.push({ cardId, count: 1 });
  }
}

// ---------------------------------------------------------------- helpers

function log(s: GameState, key: string, params: MsgParams, tone: LogEntry['tone'] = 'info') {
  s.log.push({ seq: ++s.logSeq, key, params, tone });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

const active = (s: GameState) => s.players[s.activeIndex];
const byId = (s: GameState, id: string) => s.players.find((p) => p.id === id);

/** Seat order: turns pass to index+1 (clockwise). The player on your right is index-1. */
function counterClockwiseFrom(s: GameState, index: number): PlayerState[] {
  const n = s.players.length;
  const out: PlayerState[] = [];
  for (let k = 1; k < n; k++) out.push(s.players[(index - k + n * 2) % n]);
  return out;
}

export function landmarkInPlay(s: GameState, id: string): boolean {
  return s.players.some((p) => p.landmarks.includes(id));
}

export function countSymbol(p: PlayerState, symbol: CardSymbol): number {
  let n = 0;
  for (const [id, c] of Object.entries(p.establishments)) if (getEst(id).symbol === symbol) n += c;
  return n;
}

export function establishmentCount(p: PlayerState): number {
  return Object.values(p.establishments).reduce((a, b) => a + b, 0);
}

/** +N income per activated card from ongoing "all players" landmarks (Farmers Market, Forge, ...). */
function symbolBonus(s: GameState, card: EstablishmentCard): number {
  let bonus = 0;
  for (const p of s.players) {
    for (const lid of p.landmarks) {
      const e = getLandmark(lid).effect;
      if (e.kind === 'symbol_income_bonus' && e.symbol === card.symbol) bonus += e.amount;
    }
  }
  return bonus;
}

function transfer(s: GameState, from: PlayerState, to: PlayerState, amount: number): number {
  const paid = Math.max(0, Math.min(from.coins, amount));
  from.coins -= paid;
  to.coins += paid;
  return paid;
}

function addCard(p: PlayerState, cardId: string, n = 1) {
  p.establishments[cardId] = (p.establishments[cardId] ?? 0) + n;
}
function removeCard(p: PlayerState, cardId: string): boolean {
  const c = p.establishments[cardId] ?? 0;
  if (c <= 0) return false;
  if (c === 1) delete p.establishments[cardId];
  else p.establishments[cardId] = c - 1;
  return true;
}

export function landmarkCost(s: GameState, p: PlayerState, card: LandmarkCard): number {
  let cost = card.costs[Math.min(p.landmarks.length, card.costs.length - 1)];
  if (card.id === 'launch_pad') {
    for (const q of s.players) for (const lid of q.landmarks) {
      const e = getLandmark(lid).effect;
      if (e.kind === 'launch_pad_discount') cost -= e.amount;
    }
  }
  for (const lid of p.landmarks) {
    const e = getLandmark(lid).effect;
    if (e.kind === 'landmark_discount_self') cost -= e.amount;
  }
  return Math.max(0, cost);
}

export function costOf(s: GameState, p: PlayerState, cardId: string): number {
  const c = getCard(cardId);
  return c.type === 'landmark' ? landmarkCost(s, p, c) : c.cost;
}

/** Why a player cannot build this card right now, or null if they can. */
export function buildBlocker(s: GameState, playerId: string, cardId: string): string | null {
  if (s.phase !== 'build' && s.phase !== 'setup') return 'err_not_build_phase';
  const p = active(s);
  if (p.id !== playerId) return 'err_not_your_turn';
  if (s.builtThisTurn) return 'err_one_build';
  const row = rowOf(cardId);
  if (!s.market[row].some((m) => m.cardId === cardId && m.count > 0)) return 'err_not_in_market';
  const card = getCard(cardId);
  if (card.type === 'landmark') {
    if (s.phase === 'setup') return 'err_setup_est_only';
    if (p.landmarks.includes(cardId)) return 'err_have_landmark';
    if (card.effect.kind === 'landmark_discount_self') {
      const others = s.players.filter((q) => q.id !== p.id);
      if (p.landmarks.length > 0 || others.some((q) => q.landmarks.length === 0)) {
        return 'err_loan_office';
      }
    }
  }
  if (costOf(s, p, cardId) > p.coins) return 'err_no_coins';
  return null;
}

// ---------------------------------------------------------------- reducer

export function applyAction(
  prev: GameState,
  playerId: string,
  action: Action,
  opts: ApplyOptions = {},
): ActionResult {
  if (prev.phase === 'ended') return { ok: false, error: 'err_game_over' };
  const s: GameState = structuredClone(prev);
  const p = active(s);
  if (!p || p.id !== playerId) return { ok: false, error: 'err_not_your_turn' };

  switch (action.type) {
    case 'roll': {
      if (s.phase !== 'roll') return { ok: false, error: 'err_cannot_roll' };
      if (action.dice !== 1 && action.dice !== 2) return { ok: false, error: 'err_bad_dice' };
      const dice = opts.diceOverride ?? Array.from({ length: action.dice }, () => randInt(s, 6) + 1);
      if (dice.length !== action.dice || dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) {
        return { ok: false, error: 'err_bad_dice' };
      }
      resolveRoll(s, dice);
      return { ok: true, state: s };
    }
    case 'build': {
      const err = buildBlocker(s, playerId, action.cardId);
      if (err) return { ok: false, error: err };
      doBuild(s, p, action.cardId);
      if (s.phase !== 'ended') endTurn(s);
      return { ok: true, state: s };
    }
    case 'pass': {
      if (s.phase !== 'build' && s.phase !== 'setup') return { ok: false, error: 'err_cannot_pass' };
      log(s, 'pass', { p: p.name }, 'info');
      endTurn(s);
      return { ok: true, state: s };
    }
    case 'exchange':
    case 'skip_exchange': {
      const pc = s.pending[0];
      if (s.phase !== 'choice' || pc?.kind !== 'business_center') return { ok: false, error: 'err_no_exchange' };
      if (action.type === 'exchange') {
        const target = byId(s, action.targetPlayerId);
        if (!target || target.id === p.id) return { ok: false, error: 'err_bad_target' };
        if (!(p.establishments[action.giveCardId] > 0)) return { ok: false, error: 'err_no_card_give' };
        if (!(target.establishments[action.takeCardId] > 0)) return { ok: false, error: 'err_target_no_card' };
        removeCard(p, action.giveCardId);
        removeCard(target, action.takeCardId);
        addCard(p, action.takeCardId);
        addCard(target, action.giveCardId);
        log(s, 'exchange', { p: p.name, give: action.giveCardId, take: action.takeCardId, q: target.name }, 'info');
      } else {
        log(s, 'exchange_skip', { p: p.name }, 'info');
      }
      s.pending.shift();
      advanceAfterChoices(s);
      return { ok: true, state: s };
    }
    case 'give': {
      const pc = s.pending[0];
      if (s.phase !== 'choice' || pc?.kind !== 'moving_company') return { ok: false, error: 'err_no_give' };
      const to = byId(s, pc.toPlayerId)!;
      if (!removeCard(p, action.cardId)) return { ok: false, error: 'err_not_owned' };
      addCard(to, action.cardId);
      log(s, 'give', { p: p.name, card: action.cardId, q: to.name }, 'pay');
      s.pending.shift();
      advanceAfterChoices(s);
      return { ok: true, state: s };
    }
    default:
      return { ok: false, error: 'err_bad_command' };
  }
}

// ---------------------------------------------------------------- roll resolution

function resolveRoll(s: GameState, dice: number[]) {
  const total = dice.reduce((a, b) => a + b, 0);
  const doubles = dice.length === 2 && dice[0] === dice[1];
  s.lastRoll = { dice, total, doubles };
  const act = active(s);
  log(s, 'roll', { p: act.name, n: dice.length, dice: dice.join(' + '), total, doubles: doubles ? 1 : 0 }, 'roll');

  let activeReceived = 0;
  const matches = (c: EstablishmentCard) => c.activation.includes(total);
  const ownedMatching = (p: PlayerState, color: EstablishmentCard['color']) =>
    Object.entries(p.establishments)
      .map(([id, n]) => ({ card: getEst(id), n }))
      .filter(({ card }) => card.color === color && matches(card));

  // 1. Red — restaurants of opponents, resolved counter-clockwise from the active player.
  for (const owner of counterClockwiseFrom(s, s.activeIndex)) {
    for (const { card, n } of ownedMatching(owner, 'red')) {
      if (card.effect.kind !== 'take_from_active') continue;
      for (let i = 0; i < n; i++) {
        const paid = transfer(s, act, owner, card.effect.amount + symbolBonus(s, card));
        log(s, 'pay', { card: card.id, p: act.name, q: owner.name, n: paid }, 'pay');
      }
    }
  }

  // 2. Blue (everyone) and Green (active player only) — bank income.
  for (const owner of s.players) {
    const cards = [...ownedMatching(owner, 'blue'), ...(owner === act ? ownedMatching(owner, 'green') : [])];
    for (const { card, n } of cards) {
      const e = card.effect;
      let each = 0;
      if (e.kind === 'bank') each = e.amount;
      else if (e.kind === 'bank_per_symbol') each = e.amount * countSymbol(owner, e.symbol);
      else continue;
      const gain = (each + symbolBonus(s, card)) * n;
      if (gain <= 0) continue;
      owner.coins += gain;
      if (owner === act) activeReceived += gain;
      log(s, 'gain', { card: card.id, x: n, p: owner.name, n: gain }, 'gain');
    }
  }

  // 3. Purple — major establishments of the active player.
  for (const { card, n } of ownedMatching(act, 'purple')) {
    const e = card.effect;
    for (let i = 0; i < n; i++) {
      if (e.kind === 'take_from_each') {
        for (const opp of counterClockwiseFrom(s, s.activeIndex)) {
          const paid = transfer(s, opp, act, e.amount);
          activeReceived += paid;
          log(s, 'pay', { card: card.id, p: opp.name, q: act.name, n: paid }, 'pay');
        }
      } else if (e.kind === 'take_half_if_over') {
        for (const opp of counterClockwiseFrom(s, s.activeIndex)) {
          if (opp.coins > e.threshold) {
            const paid = transfer(s, opp, act, Math.floor(opp.coins / 2));
            activeReceived += paid;
            log(s, 'pay', { card: card.id, p: opp.name, q: act.name, n: paid }, 'pay');
          }
        }
      } else if (e.kind === 'exchange') {
        s.pending.push({ kind: 'business_center', playerId: act.id });
      }
    }
  }

  // 4. Orange — ongoing landmarks. "All players" landmarks apply to the roller if anyone built them.
  const inPlay = (id: string) => landmarkInPlay(s, id);
  if (inPlay('tech_startup') && total === 12) {
    act.coins += 8; activeReceived += 8;
    log(s, 'gain', { card: 'tech_startup', x: 1, p: act.name, n: 8 }, 'gain');
  }
  if (inPlay('renovation_company') && total === 6) {
    const gain = countSymbol(act, 'cup');
    if (gain > 0) {
      act.coins += gain; activeReceived += gain;
      log(s, 'gain', { card: 'renovation_company', x: 1, p: act.name, n: gain }, 'gain');
    }
  }
  if (inPlay('temple') && doubles) {
    for (const opp of counterClockwiseFrom(s, s.activeIndex)) {
      const paid = transfer(s, opp, act, 2);
      activeReceived += paid;
      log(s, 'pay', { card: 'temple', p: opp.name, q: act.name, n: paid }, 'pay');
    }
  }
  // "Receive no coins" landmarks are checked after every other income source.
  if (activeReceived === 0) {
    if (dice.length === 2 && inPlay('charterhouse')) {
      act.coins += 3;
      log(s, 'no_income_bonus', { card: 'charterhouse', p: act.name, n: 3 }, 'gain');
    }
    if (dice.length === 1 && inPlay('city_hall')) {
      act.coins += 2;
      log(s, 'no_income_bonus', { card: 'city_hall', p: act.name, n: 2 }, 'gain');
    }
  }
  if (doubles && inPlay('amusement_park')) {
    s.extraTurn = true;
    log(s, 'extra_turn_next', { card: 'amusement_park', p: act.name }, 'info');
  }
  // Moving Company transfer is delayed until every other effect this turn has resolved.
  if (doubles && inPlay('moving_company') && establishmentCount(act) > 0) {
    const right = counterClockwiseFrom(s, s.activeIndex)[0];
    s.pending.push({ kind: 'moving_company', playerId: act.id, toPlayerId: right.id });
  }
  advanceAfterChoices(s);
}

function advanceAfterChoices(s: GameState) {
  // Skip Business Center prompts that cannot do anything.
  while (s.pending[0]?.kind === 'business_center') {
    const act = active(s);
    const possible = establishmentCount(act) > 0 && s.players.some((q) => q !== act && establishmentCount(q) > 0);
    if (possible) break;
    s.pending.shift();
  }
  if (s.pending.length > 0) {
    s.phase = 'choice';
    return;
  }
  s.phase = 'build';
  const act = active(s);
  if (act.coins === 0) {
    act.coins = 1;
    log(s, 'zero_coin', { p: act.name }, 'gain');
  }
}

// ---------------------------------------------------------------- build

function doBuild(s: GameState, p: PlayerState, cardId: string) {
  const card = getCard(cardId);
  const cost = costOf(s, p, cardId);
  p.coins -= cost;
  const row = rowOf(cardId);
  const slot = s.market[row].find((m) => m.cardId === cardId)!;
  slot.count--;
  if (slot.count === 0) s.market[row] = s.market[row].filter((m) => m !== slot);
  refillRow(s, row);
  s.builtThisTurn = true;

  if (card.type === 'establishment') {
    addCard(p, cardId);
    log(s, 'build', { p: p.name, card: cardId, n: cost }, 'build');
    return;
  }
  p.landmarks.push(cardId);
  log(s, 'build_landmark', { p: p.name, card: cardId, n: cost }, 'build');
  applyImmediate(s, p, card);
  if (s.phase === 'ended') return;
  if (p.landmarks.length >= LANDMARKS_TO_WIN) win(s, p, 'reason_three');
}

function applyImmediate(s: GameState, p: PlayerState, card: LandmarkCard) {
  const e = card.effect;
  const idx = s.players.indexOf(p);
  const opps = counterClockwiseFrom(s, idx);
  const take = (opp: PlayerState, amount: number) => {
    if (amount <= 0) return;
    const paid = transfer(s, opp, p, amount);
    log(s, 'pay', { card: card.id, p: opp.name, q: p.name, n: paid }, 'pay');
  };
  switch (e.kind) {
    case 'take_half_if_over':
      for (const o of opps) if (o.coins > e.threshold) take(o, Math.floor(o.coins / 2));
      break;
    case 'take_from_each':
      for (const o of opps) take(o, e.amount);
      break;
    case 'take_per_landmark':
      for (const o of opps) take(o, e.amount * o.landmarks.length);
      break;
    case 'take_per_symbol':
      for (const o of opps) take(o, e.amount * countSymbol(o, e.symbol));
      break;
    case 'take_if_landmarks':
      for (const o of opps) if (o.landmarks.length === e.landmarks) take(o, e.amount);
      break;
    case 'redistribute': {
      // See docs/RULE_ISSUES.md#park — every player gets ceil(total / n); bank covers the remainder.
      const totalCoins = s.players.reduce((a, q) => a + q.coins, 0);
      const each = Math.ceil(totalCoins / s.players.length);
      for (const q of s.players) q.coins = each;
      log(s, 'park', { n: each }, 'info');
      break;
    }
    case 'extra_turn':
      s.extraTurn = true;
      log(s, 'extra_turn_next', { card: 'radio_tower', p: p.name }, 'info');
      break;
    case 'win':
      win(s, p, 'reason_launch');
      break;
    default:
      break; // ongoing effects are evaluated where they apply
  }
}

function win(s: GameState, p: PlayerState, reason: string) {
  s.phase = 'ended';
  s.winnerId = p.id;
  s.extraTurn = false;
  s.pending = [];
  log(s, 'win', { p: p.name, reason }, 'win');
}

// ---------------------------------------------------------------- turn flow

function endTurn(s: GameState) {
  const p = active(s);
  if (s.phase === 'setup') {
    s.builtThisTurn = false;
    const n = s.players.length;
    s.activeIndex = (s.activeIndex + 1) % n;
    if (s.activeIndex === s.firstPlayerIndex) {
      s.setupRound++;
      if (s.setupRound > SETUP_ROUNDS) {
        s.phase = 'roll';
        log(s, 'setup_done', { p: active(s).name }, 'info');
      }
    }
    return;
  }
  if (!s.builtThisTurn && landmarkInPlay(s, 'airport')) {
    p.coins += 5;
    log(s, 'no_build_bonus', { card: 'airport', p: p.name, n: 5 }, 'gain');
  }
  if (s.extraTurn) {
    log(s, 'extra_turn', { p: p.name }, 'info');
  } else {
    s.activeIndex = (s.activeIndex + 1) % s.players.length;
  }
  s.turn++;
  s.extraTurn = false;
  s.builtThisTurn = false;
  s.lastRoll = null;
  s.phase = 'roll';
}

// ---------------------------------------------------------------- disconnected players

/**
 * Ends the active player's turn on their behalf (used when they are disconnected).
 * Optional choices are declined, mandatory ones are made deterministically, nothing is built,
 * and any extra turn is forfeited. A turn skipped before rolling grants no Airport income.
 */
export function forceSkipTurn(prev: GameState): GameState {
  if (prev.phase === 'ended') return prev;
  const s: GameState = structuredClone(prev);
  const p = active(s);
  log(s, 'skip_turn', { p: p.name }, 'info');
  s.extraTurn = false;
  if (s.phase === 'setup') { endTurn(s); return s; }
  if (s.phase === 'roll') {
    s.activeIndex = (s.activeIndex + 1) % s.players.length;
    s.turn++;
    s.builtThisTurn = false;
    s.lastRoll = null;
    return s;
  }
  while (s.phase === 'choice' && s.pending.length > 0) {
    const pc = s.pending.shift()!;
    if (pc.kind === 'moving_company') {
      const [cardId] = Object.keys(p.establishments).sort((a, b) => getEst(a).cost - getEst(b).cost || a.localeCompare(b));
      if (cardId) {
        const to = byId(s, pc.toPlayerId)!;
        removeCard(p, cardId);
        addCard(to, cardId);
        log(s, 'give_auto', { p: p.name, card: cardId, q: to.name }, 'pay');
      }
    }
    advanceAfterChoices(s);
  }
  s.extraTurn = false;
  endTurn(s);
  return s;
}

/**
 * Permanently removes a player (e.g. disconnected for good). Their establishments and landmarks
 * leave the game and their coins go back to the bank. If only one player remains, they win.
 */
export function removePlayer(prev: GameState, playerId: string, reason: 'removed' | 'forfeit' = 'removed'): GameState {
  const idx = prev.players.findIndex((p) => p.id === playerId);
  if (idx < 0 || prev.phase === 'ended') return prev;
  const s: GameState = structuredClone(prev);
  const [gone] = s.players.splice(idx, 1);
  const n = s.players.length;
  log(s, reason === 'forfeit' ? 'player_forfeit' : 'player_removed', { p: gone.name }, 'info');

  if (n < MIN_PLAYERS) {
    win(s, s.players[0], 'reason_last');
    s.activeIndex = 0;
    return s;
  }
  if (idx < s.firstPlayerIndex) s.firstPlayerIndex--;
  s.firstPlayerIndex %= n;

  if (idx === s.activeIndex) {
    // The removed player's turn ends; the next player (now at the same index) starts fresh.
    s.activeIndex %= n;
    s.pending = [];
    s.lastRoll = null;
    s.extraTurn = false;
    s.builtThisTurn = false;
    if (s.phase === 'setup') {
      if (s.activeIndex === s.firstPlayerIndex && idx >= n) {
        s.setupRound++;
        if (s.setupRound > SETUP_ROUNDS) s.phase = 'roll';
      }
    } else {
      s.phase = 'roll';
      s.turn++;
    }
  } else {
    if (idx < s.activeIndex) s.activeIndex--;
    // A pending Moving Company gift aimed at the removed player goes to the new right-hand neighbour.
    for (const pc of s.pending) {
      if (pc.kind === 'moving_company' && pc.toPlayerId === gone.id) {
        pc.toPlayerId = counterClockwiseFrom(s, s.activeIndex)[0].id;
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------- public view

export interface PublicGameState extends Omit<GameState, 'rngState' | 'decks'> {
  deckCounts: Record<Row, number>;
}

/** Strips hidden deck order and RNG state before sending to clients. */
export function toPublic(s: GameState): PublicGameState {
  const { rngState: _r, decks, ...rest } = s;
  return {
    ...structuredClone(rest),
    deckCounts: { low: decks.low.length, high: decks.high.length, landmark: decks.landmark.length },
  };
}
