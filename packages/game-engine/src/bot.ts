import { getCard, getEst, type EstablishmentCard } from './cards';
import { buildBlocker, costOf, establishmentCount, type Action, type GameState, type PlayerState } from './engine';

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

/** Chance of rolling `total` with 1 or 2 dice. */
function chance(total: number, dice: 1 | 2): number {
  if (dice === 1) return total >= 1 && total <= 6 ? 1 / 6 : 0;
  return total >= 2 && total <= 12 ? (6 - Math.abs(total - 7)) / 36 : 0;
}

/** Rough coins one copy of a card earns for its owner when it activates. */
function payout(c: EstablishmentCard, owner: PlayerState, opponents: number): number {
  const e = c.effect;
  switch (e.kind) {
    case 'bank': case 'take_from_active': return e.amount;
    case 'bank_per_symbol': return e.amount * (Object.entries(owner.establishments)
      .filter(([id]) => getEst(id).symbol === e.symbol).reduce((a, [, n]) => a + n, 0) + 1);
    case 'take_from_each': return e.amount * opponents;
    case 'take_half_if_over': return 3;
    default: return 2; // business center: a good trade
  }
}

/** Coins the card is expected to earn per round of turns. */
function value(s: GameState, p: PlayerState, c: EstablishmentCard): number {
  const n = s.players.length;
  const p1 = c.activation.reduce((a, t) => a + chance(t, 1), 0);
  const p2 = c.activation.reduce((a, t) => a + chance(t, 2), 0);
  const pOwn = Math.max(p1, p2);
  const pOther = (p1 + p2) / 2; // opponents mix 1 and 2 dice
  const per = payout(c, p, n - 1);
  if (c.color === 'blue') return per * (pOwn + pOther * (n - 1));
  if (c.color === 'red') return per * pOther * (n - 1);
  return per * pOwn; // green, purple: own turn only
}

function expectedIncome(s: GameState, p: PlayerState, dice: 1 | 2): number {
  let sum = 0;
  for (const [id, cnt] of Object.entries(p.establishments)) {
    const c = getEst(id);
    if (c.color !== 'blue' && c.color !== 'green' && c.color !== 'purple') continue;
    sum += cnt * payout(c, p, s.players.length - 1) * c.activation.reduce((a, t) => a + chance(t, dice), 0);
  }
  return sum;
}

const cheapestOwned = (p: PlayerState) =>
  Object.keys(p.establishments).sort((a, b) => getEst(a).cost - getEst(b).cost || a.localeCompare(b))[0];

/**
 * Bot policy: always returns a legal action for the active player.
 * easy — random, often passes; normal — builds the best card it can afford;
 * hard — picks dice by expected income, saves for landmarks, buys cards by value, uses Business Center.
 */
export function botAction(s: GameState, level: BotLevel = 'normal', rand: () => number = Math.random): Action {
  const p = s.players[s.activeIndex];
  const others = s.players.filter((q) => q !== p);

  if (s.phase === 'roll') {
    if (level === 'hard') return { type: 'roll', dice: expectedIncome(s, p, 2) > expectedIncome(s, p, 1) ? 2 : 1 };
    const big = Object.keys(p.establishments).some((id) => getEst(id).activation.some((n) => n > 6));
    if (level === 'easy') return { type: 'roll', dice: big && rand() < 0.6 ? 2 : 1 };
    return { type: 'roll', dice: big ? 2 : 1 };
  }

  if (s.phase === 'choice') {
    const pc = s.pending[0];
    if (pc?.kind === 'business_center') {
      if (level !== 'hard') return { type: 'skip_exchange' };
      const give = cheapestOwned(p);
      let best: { q: PlayerState; id: string } | null = null;
      for (const q of others) {
        for (const id of Object.keys(q.establishments)) {
          if (!best || getEst(id).cost > getEst(best.id).cost || (getEst(id).cost === getEst(best.id).cost && q.coins > best.q.coins)) best = { q, id };
        }
      }
      if (!give || !best || getEst(best.id).cost <= getEst(give).cost) return { type: 'skip_exchange' };
      return { type: 'exchange', giveCardId: give, targetPlayerId: best.q.id, takeCardId: best.id };
    }
    return { type: 'give', cardId: cheapestOwned(p) };
  }

  const options = (['landmark', 'high', 'low'] as const)
    .flatMap((row) => s.market[row].map((m) => m.cardId))
    .filter((id) => !buildBlocker(s, p.id, id));
  if (options.length === 0) return { type: 'pass' };
  const landmarks = options.filter((id) => getCard(id).type === 'landmark');
  const ests = options.filter((id) => getCard(id).type === 'establishment');

  if (level === 'easy') {
    if (s.phase !== 'setup' && rand() < 0.35) return { type: 'pass' };
    const pool = landmarks.length > 0 && rand() < 0.7 ? landmarks : ests.length > 0 ? ests : landmarks;
    return { type: 'build', cardId: pool[Math.floor(rand() * pool.length)] };
  }

  if (level === 'normal') {
    const score = (id: string) => (getCard(id).type === 'landmark' ? 1000 : 0) + costOf(s, p, id) + (p.establishments[id] ? 0.5 : 0);
    options.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    return { type: 'build', cardId: options[0] };
  }

  // hard
  if (landmarks.length > 0) {
    const win = landmarks.find((id) => id === 'launch_pad');
    landmarks.sort((a, b) => costOf(s, p, b) - costOf(s, p, a) || a.localeCompare(b));
    return { type: 'build', cardId: win ?? landmarks[0] };
  }
  if (s.phase !== 'setup' && establishmentCount(p) >= 4) {
    // Save up when the cheapest landmark on offer is within reach of next turn's income.
    const next = s.market.landmark.map((m) => costOf(s, p, m.cardId)).sort((a, b) => a - b)[0];
    if (next !== undefined && p.coins + 6 >= next) return { type: 'pass' };
  }
  if (ests.length === 0) return { type: 'pass' };
  ests.sort((a, b) => value(s, p, getEst(b)) / getEst(b).cost - value(s, p, getEst(a)) / getEst(a).cost || a.localeCompare(b));
  return { type: 'build', cardId: ests[0] };
}
