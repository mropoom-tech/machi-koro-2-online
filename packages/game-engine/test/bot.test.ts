import { describe, expect, it } from 'vitest';
import { applyAction, botAction, createGame, forceSkipTurn, verifiedDeck } from '../src';

describe('bot', () => {
  it('plays legal moves until a 4-bot game ends', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = createGame(['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })), verifiedDeck()!, seed);
      let steps = 0;
      while (s.phase !== 'ended' && steps++ < 5000) {
        const r = applyAction(s, s.players[s.activeIndex].id, botAction(s));
        s = r.ok ? r.state : forceSkipTurn(s);
      }
      expect(s.phase).toBe('ended');
    }
  });
});
