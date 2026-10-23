import { describe, expect, it } from 'vitest';
import { applyAction, botAction, createGame, forceSkipTurn, verifiedDeck, type BotLevel, type GameState } from '../src';
import { mulberry32 } from './util';

function play(levels: BotLevel[], seed: number): GameState {
  const rand = mulberry32(seed * 7 + 1);
  let s = createGame(levels.map((_, i) => ({ id: `p${i}`, name: `p${i}` })), verifiedDeck()!, seed);
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 5000) {
    const r = applyAction(s, s.players[s.activeIndex].id, botAction(s, levels[s.activeIndex], rand));
    expect(r.ok).toBe(true);
    s = r.ok ? r.state : forceSkipTurn(s);
  }
  return s;
}

describe('bot', () => {
  it('every level makes only legal moves until the game ends', () => {
    for (const lv of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3]) expect(play([lv, lv, lv, lv], seed).phase).toBe('ended');
    }
  });

  it('hard beats easy most of the time', () => {
    let hard = 0;
    for (let seed = 1; seed <= 40; seed++) if (play(['hard', 'easy'], seed).winnerId === 'p0') hard++;
    expect(hard).toBeGreaterThan(24);
  });

  it('records coins per turn and income per card', () => {
    const s = play(['normal', 'normal'], 5);
    expect(s.stats!.coins.p0.length).toBeGreaterThan(3);
    const earned = Object.values(s.stats!.earned).flatMap((e) => Object.values(e));
    expect(earned.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
