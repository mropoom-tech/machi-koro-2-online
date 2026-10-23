import { getCard, getEst } from './cards';
import { buildBlocker, costOf, type Action, type GameState } from './engine';

/**
 * A simple bot policy: always a legal action for the active player.
 * Rolls two dice once it owns cards that need them, declines optional exchanges,
 * gives away its cheapest card, and builds the best card it can afford (landmarks first).
 */
export function botAction(s: GameState): Action {
  const p = s.players[s.activeIndex];
  if (s.phase === 'roll') {
    const wantsTwo = Object.keys(p.establishments).some((id) => getEst(id).activation.some((n) => n > 6));
    return { type: 'roll', dice: wantsTwo ? 2 : 1 };
  }
  if (s.phase === 'choice') {
    const pc = s.pending[0];
    if (pc?.kind === 'business_center') return { type: 'skip_exchange' };
    const [cardId] = Object.keys(p.establishments).sort((a, b) => getEst(a).cost - getEst(b).cost || a.localeCompare(b));
    return { type: 'give', cardId };
  }
  const options = (['landmark', 'high', 'low'] as const)
    .flatMap((row) => s.market[row].map((m) => m.cardId))
    .filter((id) => !buildBlocker(s, p.id, id));
  const score = (id: string) => (getCard(id).type === 'landmark' ? 1000 : 0) + costOf(s, p, id) + (p.establishments[id] ? 0.5 : 0);
  options.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  return options.length > 0 ? { type: 'build', cardId: options[0] } : { type: 'pass' };
}
