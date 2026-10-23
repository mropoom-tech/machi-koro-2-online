import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyAction, createGame, forceSkipTurn, removePlayer, DEMO_DECK, ESTABLISHMENTS, LANDMARKS, MARKET_SIZE, toPublic, verifiedDeck,
  parseClientMessage, t, hasMessage, type Action, type GameState,
} from '../src';

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

/** A game already past setup, with p0 active and empty tableaus. */
function game(n = 3, seed = 42): GameState {
  const s = createGame(names(n), DEMO_DECK, seed);
  s.phase = 'roll';
  s.activeIndex = 0;
  s.firstPlayerIndex = 0;
  for (const p of s.players) p.coins = 0;
  return s;
}

function act(s: GameState, pid: string, a: Action, dice?: number[]): GameState {
  const r = applyAction(s, pid, a, dice ? { diceOverride: dice } : {});
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function putInMarket(s: GameState, cardId: string) {
  const row = LANDMARKS.some((l) => l.id === cardId) ? 'landmark' : ESTABLISHMENTS.find((e) => e.id === cardId)!.tier;
  s.market[row].push({ cardId, count: 1 });
}

describe('card database', () => {
  it('has 20 establishments and 23 landmarks with Thai text', () => {
    expect(ESTABLISHMENTS).toHaveLength(20);
    expect(LANDMARKS).toHaveLength(23);
    for (const c of [...ESTABLISHMENTS, ...LANDMARKS]) {
      expect(c.nameTh.length).toBeGreaterThan(0);
      expect(c.effectTh.length).toBeGreaterThan(0);
      expect(c.quantityInDeck).toBeGreaterThan(0);
    }
  });
  it('uses the confirmed deck: 86 establishments (rulebook total) + 23 landmarks', () => {
    const deck = verifiedDeck()!;
    expect(deck.mode).toBe('VERIFIED');
    const sum = (ids: string[]) => ids.reduce((a, id) => a + deck.copies[id], 0);
    expect(sum(ESTABLISHMENTS.map((c) => c.id))).toBe(86);
    expect(sum(LANDMARKS.map((c) => c.id))).toBe(23);
    const g = createGame(names(3), deck, 11);
    expect(g.deckMode).toBe('VERIFIED');
    const inPlay = (row: 'low' | 'high' | 'landmark') => g.decks[row].length + g.market[row].reduce((a, m) => a + m.count, 0);
    expect(inPlay('low') + inPlay('high')).toBe(86);
    expect(inPlay('landmark')).toBe(23);
  });
});

describe('setup', () => {
  it('deals 5 coins, 3 market rows of 5 unique types, and is deterministic by seed', () => {
    const a = createGame(names(4), DEMO_DECK, 7);
    const b = createGame(names(4), DEMO_DECK, 7);
    expect(a).toEqual(b);
    expect(a.players.every((p) => p.coins === 5)).toBe(true);
    for (const row of ['low', 'high', 'landmark'] as const) {
      const ids = a.market[row].map((m) => m.cardId);
      expect(ids).toHaveLength(MARKET_SIZE);
      expect(new Set(ids).size).toBe(MARKET_SIZE);
    }
    expect(a.phase).toBe('setup');
  });

  it('runs 3 setup build rounds (establishments only) then starts normal turns', () => {
    let s = createGame(names(2), DEMO_DECK, 1);
    const first = s.firstPlayerIndex;
    const lm = s.market.landmark[0].cardId;
    expect(applyAction(s, s.players[first].id, { type: 'build', cardId: lm }).ok).toBe(false);
    for (let i = 0; i < 6; i++) s = act(s, s.players[s.activeIndex].id, { type: 'pass' });
    expect(s.phase).toBe('roll');
    expect(s.activeIndex).toBe(first);
  });

  it('refuses invalid player counts', () => {
    expect(() => createGame(names(1), DEMO_DECK, 1)).toThrow();
    expect(() => createGame(names(6), DEMO_DECK, 1)).toThrow();
  });

  it('public view hides deck order and rng', () => {
    const pub = toPublic(createGame(names(2), DEMO_DECK, 3)) as any;
    expect(pub.decks).toBeUndefined();
    expect(pub.rngState).toBeUndefined();
    expect(pub.deckCounts.low).toBeGreaterThan(0);
  });
});

describe('turn validation', () => {
  it('rejects actions from the wrong player and double rolls', () => {
    let s = game();
    expect(applyAction(s, 'p1', { type: 'roll', dice: 1 }).ok).toBe(false);
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    expect(applyAction(s, 'p0', { type: 'roll', dice: 1 }).ok).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const s = game();
    const before = JSON.stringify(s);
    act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('gives 1 coin when the active player has 0 coins at the build step', () => {
    const s = act(game(), 'p0', { type: 'roll', dice: 1 }, [4]);
    expect(s.phase).toBe('build');
    expect(s.players[0].coins).toBe(1);
  });

  it('blocks building without enough coins and allows only 1 build per turn', () => {
    let s = game();
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    putInMarket(s, 'mine');
    expect(applyAction(s, 'p0', { type: 'build', cardId: 'mine' })).toMatchObject({ ok: false, error: 'err_no_coins' });
    s.players[0].coins = 10;
    s = act(s, 'p0', { type: 'build', cardId: 'mine' });
    expect(s.players[0].establishments.mine).toBe(1);
    expect(s.players[0].coins).toBe(6);
    expect(s.activeIndex).toBe(1); // turn ended automatically
  });

  it('refills the market row to 5 unique types after a purchase empties a slot', () => {
    let s = game();
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    s.players[0].coins = 99;
    const slot = s.market.low[0];
    slot.count = 1;
    s = act(s, 'p0', { type: 'build', cardId: slot.cardId });
    expect(new Set(s.market.low.map((m) => m.cardId)).size).toBe(MARKET_SIZE);
  });
});

describe('income activation', () => {
  it('blue works on anyone’s turn, green only on owner’s turn, every copy counts', () => {
    let s = game();
    s.players[0].establishments = { bakery: 2 };
    s.players[1].establishments = { wheat_field: 3, bakery: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [2]);
    expect(s.players[0].coins).toBe(4);
    expect(s.players[1].coins).toBe(3);
  });

  it('red takes from active player, counter-clockwise, paying only what they have', () => {
    let s = game(3);
    s.players[0].coins = 4;
    s.players[1].establishments = { cafe: 1 };
    s.players[2].establishments = { cafe: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [3]);
    // counter-clockwise from p0 is p2 first, then p1
    expect(s.players[2].coins).toBe(2);
    expect(s.players[1].coins).toBe(2);
    s = game(3);
    s.players[0].coins = 3;
    s.players[1].establishments = { cafe: 1 };
    s.players[2].establishments = { cafe: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [3]);
    expect(s.players[2].coins).toBe(2);
    expect(s.players[1].coins).toBe(1);
    expect(s.players[0].coins).toBe(1); // reached 0 then got build-step coin
  });

  it('Rulebook p.7 example: unpaid deficit is ignored, the bank does NOT make up the difference', () => {
    // Gabrielle (p0) rolls 3 with 3 coins; Tomoko (p2, counter-clockwise first) has 1 Café, Ezra (p1) has 2.
    let s = game(3);
    s.players[0].coins = 3;
    s.players[1].establishments = { cafe: 2 };
    s.players[2].establishments = { cafe: 1 };
    const bankBefore = s.players.reduce((a, p) => a + p.coins, 0);
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [3]);
    expect(s.players[2].coins).toBe(2); // Tomoko paid in full first
    expect(s.players[1].coins).toBe(1); // Ezra owed 4, receives only 1
    // no coins were created: only the build-step "0 coins → 1 coin" rule adds money
    expect(s.players.reduce((a, p) => a + p.coins, 0)).toBe(bankBefore + 1);
    expect(s.players[0].coins).toBe(1);
  });

  it('red resolves before green income', () => {
    let s = game(2);
    s.players[0].establishments = { bakery: 1 };
    s.players[1].establishments = { cafe: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [3]);
    expect(s.players[1].coins).toBe(0); // p0 had 0 when cafe resolved
    expect(s.players[0].coins).toBe(2);
  });

  it('combo cards count every copy of the symbol but carry no symbol themselves', () => {
    let s = game(2);
    s.players[0].establishments = { flower_shop: 1, flower_garden: 2 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [6]);
    expect(s.players[0].coins).toBe(6); // 3 × 2 flower gardens (the shop itself is COMBO)
    s = game(2);
    s.players[0].establishments = { furniture_factory: 2, forest: 1, mine: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [4, 4]);
    expect(s.players[0].coins).toBe(16); // each factory: 4 × 2 gears
    s = game(2);
    s.players[0].establishments = { food_warehouse: 1, cafe: 2, sushi_bar: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [5, 5]);
    expect(s.players[0].coins).toBe(6); // 2 × 3 cups, warehouse not counted
  });

  it('Rulebook p.6 example: 2 Vineyards + 1 Apple Orchard → Winery earns 3×3 = 9', () => {
    let s = game(2);
    s.players[0].establishments = { winery: 1, vineyard: 2, apple_orchard: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [4, 5]);
    expect(s.players[0].coins).toBe(9);
  });

  it('Farmers Market / Soda Bottling Plant add +1 per activated card for everyone', () => {
    let s = game(2);
    s.players[1].landmarks = ['farmers_market', 'soda_bottling_plant'];
    s.players[0].establishments = { wheat_field: 2 };
    s.players[1].establishments = { sushi_bar: 1 };
    s.players[0].coins = 10;
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [1]);
    expect(s.players[1].coins).toBe(4); // sushi 3 + soda 1
    expect(s.players[0].coins).toBe(10 - 4 + 4); // wheat (1+1) * 2
  });

  it('Stadium takes 3 from each opponent; Shopping District halves only those with >10', () => {
    let s = game(3);
    s.players[0].establishments = { stadium: 1 };
    s.players[1].coins = 2; s.players[2].coins = 5;
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [3, 4]);
    expect(s.players.map((p) => p.coins)).toEqual([5, 0, 2]);
    s = game(3);
    s.players[0].establishments = { shopping_district: 1 };
    s.players[1].coins = 10; s.players[2].coins = 15;
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [4, 4]);
    expect(s.players.map((p) => p.coins)).toEqual([7, 10, 8]);
  });
});

describe('choices', () => {
  it('Business Center offers an optional exchange', () => {
    let s = game(2);
    s.players[0].establishments = { business_center: 1, wheat_field: 1 };
    s.players[1].establishments = { mine: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [6]);
    expect(s.phase).toBe('choice');
    expect(applyAction(s, 'p0', { type: 'build', cardId: 'x' }).ok).toBe(false);
    s = act(s, 'p0', { type: 'exchange', giveCardId: 'wheat_field', targetPlayerId: 'p1', takeCardId: 'mine' });
    expect(s.players[0].establishments).toEqual({ business_center: 1, mine: 1 });
    expect(s.players[1].establishments).toEqual({ wheat_field: 1 });
    expect(s.phase).toBe('build');
  });

  it('Moving Company forces giving 1 establishment to the player on the right after all effects', () => {
    let s = game(3);
    s.players[2].landmarks = ['moving_company'];
    s.players[0].establishments = { bakery: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [1, 1]);
    expect(s.phase).toBe('choice');
    expect(s.pending[0]).toMatchObject({ kind: 'moving_company', toPlayerId: 'p2' });
    expect(applyAction(s, 'p0', { type: 'pass' }).ok).toBe(false);
    s = act(s, 'p0', { type: 'give', cardId: 'bakery' });
    expect(s.players[2].establishments.bakery).toBe(1);
    expect(s.phase).toBe('build');
  });
});

describe('landmarks', () => {
  it('landmark cost depends on how many landmarks you own; Loan Office reduces by 2', () => {
    let s = game(2);
    s.phase = 'build';
    s.players[0].coins = 100;
    putInMarket(s, 'forge');
    s.players[0].landmarks = ['loan_office'];
    s = act(s, 'p0', { type: 'build', cardId: 'forge' });
    expect(s.players[0].coins).toBe(100 - (16 - 2));
  });

  it('Loan Office requires being the only player without landmarks', () => {
    const s = game(3);
    s.phase = 'build';
    s.players[0].coins = 50;
    putInMarket(s, 'loan_office');
    s.players[1].landmarks = ['forge'];
    expect(applyAction(s, 'p0', { type: 'build', cardId: 'loan_office' }).ok).toBe(false);
    s.players[2].landmarks = ['temple'];
    expect(applyAction(s, 'p0', { type: 'build', cardId: 'loan_office' }).ok).toBe(true);
  });

  it('third landmark wins immediately and blocks further actions', () => {
    let s = game(2);
    s.phase = 'build';
    s.players[0].coins = 100;
    s.players[0].landmarks = ['forge', 'temple'];
    putInMarket(s, 'radio_tower');
    s = act(s, 'p0', { type: 'build', cardId: 'radio_tower' });
    expect(s.phase).toBe('ended');
    expect(s.winnerId).toBe('p0');
    expect(s.extraTurn).toBe(false);
    expect(applyAction(s, 'p0', { type: 'roll', dice: 1 }).ok).toBe(false);
  });

  it('Launch Pad wins on build and Observatory discounts it by 5', () => {
    let s = game(2);
    s.phase = 'build';
    s.players[1].landmarks = ['observatory'];
    s.players[0].coins = 40;
    putInMarket(s, 'launch_pad');
    s = act(s, 'p0', { type: 'build', cardId: 'launch_pad' });
    expect(s.winnerId).toBe('p0');
    expect(s.players[0].coins).toBe(0);
  });

  it('Radio Tower and Amusement Park grant only one extra turn', () => {
    let s = game(2);
    s.players[0].landmarks = ['amusement_park'];
    s.players[0].coins = 20;
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [3, 3]);
    putInMarket(s, 'radio_tower');
    s = act(s, 'p0', { type: 'build', cardId: 'radio_tower' });
    expect(s.activeIndex).toBe(0);
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    s = act(s, 'p0', { type: 'pass' });
    expect(s.activeIndex).toBe(1);
  });

  it('Airport pays 5 if nothing was built; Charterhouse / City Hall pay when no income', () => {
    let s = game(2);
    s.players[1].landmarks = ['airport', 'charterhouse', 'city_hall'];
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [2, 3]);
    expect(s.players[0].coins).toBe(3);
    s = act(s, 'p0', { type: 'pass' });
    expect(s.players[0].coins).toBe(8);
    s = act(s, 'p1', { type: 'roll', dice: 1 }, [5]);
    expect(s.players[1].coins).toBe(2);
  });

  it('Temple, Tech Startup and Renovation Company apply to whoever rolls', () => {
    let s = game(3);
    s.players[2].landmarks = ['temple', 'tech_startup'];
    s.players[1].coins = 1; s.players[2].coins = 5;
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [6, 6]);
    expect(s.players.map((p) => p.coins)).toEqual([11, 0, 3]);
    s = game(2);
    s.players[1].landmarks = ['renovation_company'];
    s.players[0].establishments = { cafe: 2, food_warehouse: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [2, 4]);
    expect(s.players[0].coins).toBe(2); // 2 cups (Food Warehouse is COMBO)
  });

  it('immediate landmark effects: French Restaurant, Museum, TV Station, Private Club, Exhibit Hall', () => {
    const setup = (lm: string) => {
      const s = game(3);
      s.phase = 'build';
      s.players[0].coins = 30;
      putInMarket(s, lm);
      s.players[1].coins = 20; s.players[1].landmarks = ['forge', 'temple'];
      s.players[1].establishments = { cafe: 2, bakery: 1 };
      s.players[2].coins = 1; s.players[2].landmarks = ['airport'];
      return s;
    };
    expect(act(setup('french_restaurant'), 'p0', { type: 'build', cardId: 'french_restaurant' }).players.map((p) => p.coins)).toEqual([23, 18, 0]);
    expect(act(setup('museum'), 'p0', { type: 'build', cardId: 'museum' }).players.map((p) => p.coins)).toEqual([18 + 7, 14, 0]);
    expect(act(setup('tv_station'), 'p0', { type: 'build', cardId: 'tv_station' }).players.map((p) => p.coins)).toEqual([20, 18, 1]);
    expect(act(setup('private_club'), 'p0', { type: 'build', cardId: 'private_club' }).players.map((p) => p.coins)).toEqual([23, 15, 1]);
    expect(act(setup('exhibit_hall'), 'p0', { type: 'build', cardId: 'exhibit_hall' }).players.map((p) => p.coins)).toEqual([28, 10, 1]);
  });

  it('Park redistributes evenly, bank covers remainder (ceil)', () => {
    let s = game(3);
    s.phase = 'build';
    s.players[0].coins = 12;
    s.players[1].coins = 7; s.players[2].coins = 0;
    putInMarket(s, 'park');
    s = act(s, 'p0', { type: 'build', cardId: 'park' });
    // 0 + 7 + 0 = 7 -> ceil(7/3) = 3 each
    expect(s.players.map((p) => p.coins)).toEqual([3, 3, 3]);
  });
});

describe('skipping a disconnected player', () => {
  it('skips before rolling without Airport income and forfeits extra turns', () => {
    const s = game(3);
    s.players[1].landmarks = ['airport'];
    s.extraTurn = true;
    const t = forceSkipTurn(s);
    expect(t.activeIndex).toBe(1);
    expect(t.phase).toBe('roll');
    expect(t.players[0].coins).toBe(0);
    expect(t.log.at(-1)!).toMatchObject({ key: 'skip_turn', params: { p: 'P0' } });
  });
  it('declines Business Center and makes the mandatory Moving Company gift', () => {
    let s = game(2);
    s.players[1].landmarks = ['moving_company'];
    s.players[0].establishments = { business_center: 1, mine: 1, wheat_field: 1 };
    s.players[1].establishments = { cafe: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 2 }, [3, 3]);
    expect(s.phase).toBe('choice');
    const t = forceSkipTurn(s);
    expect(t.players[1].establishments.wheat_field).toBe(1); // cheapest card given
    expect(t.players[0].establishments.mine).toBe(1);
    expect(t.activeIndex).toBe(1);
  });
  it('passes during setup and does nothing once the game has ended', () => {
    const s = createGame(names(2), DEMO_DECK, 5);
    const first = s.activeIndex;
    expect(forceSkipTurn(s).activeIndex).toBe((first + 1) % 2);
    const ended = { ...game(2), phase: 'ended' as const };
    expect(forceSkipTurn(ended)).toBe(ended);
  });
});

describe('removing a player', () => {
  it('removes the active player: cards leave the game and the next player starts a fresh turn', () => {
    let s = game(3);
    s.players[0].establishments = { mine: 2 };
    s.players[0].landmarks = ['amusement_park'];
    s.players[0].coins = 9;
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [4]);
    const t = removePlayer(s, 'p0');
    expect(t.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(t.players[t.activeIndex].id).toBe('p1');
    expect(t.phase).toBe('roll');
    expect(t.lastRoll).toBeNull();
  });

  it('keeps the current turn when someone else is removed', () => {
    let s = game(4);
    s.activeIndex = 2;
    const t = removePlayer(s, 'p0');
    expect(t.players[t.activeIndex].id).toBe('p2');
    expect(t.phase).toBe('roll');
  });

  it('redirects a pending Moving Company gift when its receiver is removed', () => {
    let s = game(3);
    s.players[1].landmarks = ['moving_company'];
    s.players[1].establishments = { bakery: 1 };
    s.activeIndex = 1;
    s = act(s, 'p1', { type: 'roll', dice: 2 }, [2, 2]);
    expect(s.pending[0]).toMatchObject({ toPlayerId: 'p0' });
    const t = removePlayer(s, 'p0');
    expect(t.pending[0]).toMatchObject({ kind: 'moving_company', toPlayerId: 'p2' });
  });

  it('logs a forfeit differently', () => {
    expect(removePlayer(game(3), 'p1', 'forfeit').log.at(-1)!).toMatchObject({ key: 'player_forfeit', params: { p: 'P1' } });
  });

  it('the last remaining player wins', () => {
    const t = removePlayer(game(2), 'p1');
    expect(t.phase).toBe('ended');
    expect(t.winnerId).toBe('p0');
  });

  it('setup rounds still finish after the last seat of a round is removed', () => {
    let s = createGame(names(3), DEMO_DECK, 9);
    s.firstPlayerIndex = 0; s.activeIndex = 2; s.setupRound = 3;
    const t = removePlayer(s, 'p2');
    expect(t.phase).toBe('roll');
    expect(t.activeIndex).toBe(0);
  });
});

describe('i18n', () => {
  it('renders log entries in Thai and English with card names per language', () => {
    let s = game(2);
    s.players[0].establishments = { bakery: 1 };
    s = act(s, 'p0', { type: 'roll', dice: 1 }, [2]);
    const gain = s.log.find((l) => l.key === 'gain')!;
    expect(t('th', gain.key, gain.params)).toBe('ร้านเบเกอรี: P0 รับ 2 เหรียญจากธนาคาร');
    expect(t('en', gain.key, gain.params)).toBe('Bakery: P0 gets 2 coins from the bank');
  });

  it('has a TH and EN message for every key the engine and server use', () => {
    const src = ['src/engine.ts', '../../apps/worker/src/room.ts', '../../apps/worker/src/index.ts']
      .map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
    const keys = new Set([...src.matchAll(/'((?:err|n|r|why|reason)_[a-z_]+|game_start|setup_done|pass|roll|pay|gain|no_income_bonus|no_build_bonus|extra_turn_next|extra_turn|zero_coin|build_landmark|build|park|exchange_skip|exchange|give_auto|give|win|skip_turn|player_forfeit|player_removed)'/g)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(40);
    for (const k of keys) expect(hasMessage(k), k).toBe(true);
    // no Thai text left hard-coded in server/engine code paths
    for (const line of src.split('\n')) if (!line.trim().startsWith('//')) expect(/[฀-๿]/.test(line), line).toBe(false);
  });
});

describe('protocol validation', () => {
  it('rejects malformed client messages', () => {
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', actionId: 'a', expectedVersion: 1, action: { type: 'roll', dice: 3 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', actionId: 'a', expectedVersion: 1, action: { type: 'roll', dice: 2 } }))).not.toBeNull();
  });
});
