import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildBlocker, costOf, getEst, LANDMARKS_TO_WIN, MAX_MISSED_TURNS, SETUP_ROUNDS,
  type Action, type GameState, type PlayerState, type PublicGameState, type Row, type RoomView,
} from '@mk2/game-engine';
import { CardDetail, CardTile, SymbolSummary } from './Card';
import { Button, Coin, DemoBadge, Modal, ScrollRow } from './ui';
import { playBuild, playCoin, playDiceRoll, playGameOver, playLandmark, playVictory, playYourTurn } from '../sound';
import { startMusic, stopMusic } from '../music';
import { SoundSettings } from './SoundSettings';
import { LangToggle, useI18n, type UiKey } from '../i18n';
import type { ConnState } from '../net';

const ROW_LABEL: Record<Row, UiKey> = { low: 'row_low', high: 'row_high', landmark: 'row_landmark' };
// pip positions on a 3x3 grid (0..8) for faces 1..6
const PIPS: number[][] = [[], [4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

/** How long the dice tumble, then how long the result sits on screen before income is shown. */
const ROLL_MS = 900;
const LANDED_MS = 700;

// Client-side helpers reuse engine rules for hints only — the server re-validates everything.
const asState = (g: PublicGameState) => g as unknown as GameState;

function sortedEstablishments(p: PlayerState): [string, number][] {
  return Object.entries(p.establishments).sort(
    ([a], [b]) => getEst(a).activation[0] - getEst(b).activation[0] || a.localeCompare(b),
  );
}

// ------------------------------------------------------------------ dice-first reveal

function lastRollEntry(g: PublicGameState) {
  for (let i = g.log.length - 1; i >= 0; i--) if (g.log[i].key === 'roll') return g.log[i];
  return null;
}

type Reveal = { stage: 'idle' } | { stage: 'rolling'; dice: number } | { stage: 'landed' };

/**
 * Delays a newly arrived roll so everyone first sees the dice tumble and land, and only then the
 * coins, effects and log lines that the roll caused. Purely visual: the server state is already final.
 */
function useRevealedGame(g: PublicGameState): [PublicGameState, Reveal] {
  const [shown, setShown] = useState(g);
  const [reveal, setReveal] = useState<Reveal>({ stage: 'idle' });
  const target = useRef(g);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  target.current = g;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (busy.current) return; // the running animation picks up the latest state when it ends
    const roll = lastRollEntry(g);
    const prevRoll = lastRollEntry(shown);
    if (!roll || (prevRoll && roll.seq <= prevRoll.seq)) { setShown(g); return; }

    busy.current = true;
    const before = shown;
    const dice = String(roll.params.dice).split(' + ').map(Number);
    setReveal({ stage: 'rolling', dice: dice.length });
    timers.current.push(setTimeout(() => {
      // Dice landed: show the result and the "rolled" log line, but not the income yet.
      setShown({
        ...before,
        lastRoll: { dice, total: Number(roll.params.total), doubles: !!roll.params.doubles },
        log: g.log.filter((e) => e.seq <= roll.seq),
      });
      setReveal({ stage: 'landed' });
      timers.current.push(setTimeout(() => {
        busy.current = false;
        setReveal({ stage: 'idle' });
        setShown(target.current);
      }, LANDED_MS));
    }, ROLL_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  // A roll that arrived this render but whose animation effect hasn't started yet must not flash through.
  const roll = lastRollEntry(g);
  const shownRoll = lastRollEntry(shown);
  const pending = !!roll && (!shownRoll || roll.seq > shownRoll.seq);
  const effective: Reveal = reveal.stage === 'idle' && pending
    ? { stage: 'rolling', dice: String(roll!.params.dice).split(' + ').length }
    : reveal;
  return [busy.current || pending ? shown : g, effective];
}

// ------------------------------------------------------------------ dice

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const { u } = useI18n();
  return (
    <div className={`grid h-11 w-11 grid-cols-3 grid-rows-3 gap-0.5 rounded-xl bg-white p-1.5 shadow-lg ${rolling ? 'dice-rolling' : 'pop-in'}`}
      aria-label={u('die_aria', { n: value })}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`m-auto h-2 w-2 rounded-full ${PIPS[value].includes(i) ? (value === 1 ? 'bg-rose-600' : 'bg-slate-800') : ''}`} />
      ))}
    </div>
  );
}

function Dice({ g, reveal }: { g: PublicGameState; reveal: Reveal }) {
  const { u } = useI18n();
  const [face, setFace] = useState(1);
  const rolling = reveal.stage === 'rolling';
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace((f) => (f % 6) + 1), 90);
    return () => clearInterval(t);
  }, [rolling]);
  if (rolling) {
    return (
      <div className="flex items-center gap-2" aria-live="polite" aria-label={u('phase_rolling')}>
        {Array.from({ length: reveal.dice }).map((_, i) => <DieFace key={i} value={((face + i * 3) % 6) + 1} rolling />)}
      </div>
    );
  }
  if (!g.lastRoll) return <div className="flex h-14 items-center text-sm text-white/70">{u('not_rolled')}</div>;
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {g.lastRoll.dice.map((d, i) => <DieFace key={`${g.turn}-${i}-${d}`} value={d} rolling={false} />)}
      {g.lastRoll.dice.length > 1 && (
        <div className="pop-in ml-1 text-2xl font-bold text-white drop-shadow">= {g.lastRoll.total}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function usePhaseLabel() {
  const { u } = useI18n();
  return (g: PublicGameState) => {
    switch (g.phase) {
      case 'setup': return u('phase_setup', { r: g.setupRound, max: SETUP_ROUNDS });
      case 'roll': return u('phase_roll');
      case 'choice': return u('phase_choice');
      case 'build': return u('phase_build');
      case 'ended': return u('phase_ended');
    }
  };
}

function PlayerChip({ p, g, room, me, onClick }: { p: PlayerState; g: PublicGameState; room: RoomView; me: string; onClick: () => void }) {
  const { u } = useI18n();
  const isActive = g.players[g.activeIndex]?.id === p.id;
  const lp = room.players.find((x) => x.id === p.id);
  return (
    <button onClick={onClick}
      className={`flex min-w-[140px] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left shadow-sm ring-1 transition
        ${isActive ? 'turn-glow bg-amber-50 ring-amber-400' : 'bg-white ring-black/5'} hover:shadow-md`}>
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{p.name.slice(0, 2)}</div>
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${lp?.connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
          title={u(lp?.connected ? 'online' : 'offline')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{p.name}{p.id === me && <span className="text-slate-400"> ({u('you')})</span>}</div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Coin n={p.coins} bump />
          <span title={u('landmarks_title')}>🏗️ {p.landmarks.length}/{LANDMARKS_TO_WIN}</span>
          {!!lp?.missedTurns && <span className="text-amber-700" title={u('skipped_title')}>⏭️ {lp.missedTurns}/{MAX_MISSED_TURNS}</span>}
        </div>
      </div>
    </button>
  );
}

function Tableau({ p, onCard, compact }: { p: PlayerState; onCard: (id: string) => void; compact?: boolean }) {
  const { u } = useI18n();
  const est = sortedEstablishments(p);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 px-2 pt-1">
        {Array.from({ length: LANDMARKS_TO_WIN }).map((_, i) => {
          const id = p.landmarks[i];
          return id ? (
            <CardTile key={id} cardId={id} size="sm" onClick={() => onCard(id)} />
          ) : (
            <div key={i} className="flex aspect-[5/7] w-[76px] items-center justify-center rounded-xl border-2 border-dashed border-orange-300/70 p-1 text-center text-xs text-orange-400">
              {u('landmark_slot', { n: i + 1 })}
            </div>
          );
        })}
      </div>
      {est.length === 0 ? (
        <p className="px-2 py-3 text-sm text-slate-500">{u('no_establishments')}</p>
      ) : (
        compact ? (
          <div className="flex flex-wrap gap-3 px-2 pb-3 pt-3">
            {est.map(([id, n]) => <CardTile key={id} cardId={id} count={n} size="sm" onClick={() => onCard(id)} />)}
          </div>
        ) : (
          <ScrollRow className="px-2 pb-3 pt-3">
            {est.map(([id, n]) => <CardTile key={id} cardId={id} count={n} size="sm" onClick={() => onCard(id)} />)}
          </ScrollRow>
        )
      )}
    </div>
  );
}

function Market({ g, me, interactive, onCard }: { g: PublicGameState; me: string; interactive: boolean; onCard: (id: string) => void }) {
  const { u } = useI18n();
  const myTurn = interactive && g.players[g.activeIndex]?.id === me;
  const meP = g.players.find((p) => p.id === me);
  const buildPhase = myTurn && (g.phase === 'build' || g.phase === 'setup');
  return (
    <div className="space-y-3">
      {(['low', 'high', 'landmark'] as Row[]).map((row) => (
        <section key={row} className="rounded-2xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">{u(ROW_LABEL[row])}</span>
            <span className="text-xs text-slate-500">{u('deck_left', { n: g.deckCounts[row] })}</span>
          </div>
          <ScrollRow className="-mx-1 px-3 pb-3 pt-3">
            {g.market[row].map((m) => {
              const blocked = buildPhase ? buildBlocker(asState(g), me, m.cardId) : 'x';
              return (
                <CardTile key={m.cardId} cardId={m.cardId} count={m.count}
                  cost={meP ? costOf(asState(g), meP, m.cardId) : undefined}
                  dim={buildPhase && !!blocked} highlight={buildPhase && !blocked}
                  onClick={() => onCard(m.cardId)} />
              );
            })}
            {g.market[row].length === 0 && <span className="py-6 text-sm text-slate-400">{u('market_empty')}</span>}
          </ScrollRow>
        </section>
      ))}
    </div>
  );
}

const TONE = { roll: 'text-sky-700', gain: 'text-emerald-700', pay: 'text-rose-700', build: 'text-amber-700', win: 'text-amber-600 font-bold', info: 'text-slate-600' };

function Log({ g }: { g: PublicGameState }) {
  const { m } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [g.log.length]);
  return (
    <div ref={ref} className="font-body max-h-full space-y-1 overflow-y-auto text-sm">
      {g.log.map((e) => <div key={e.seq} className={`pop-in ${TONE[e.tone ?? 'info']}`}>{m(e.key, e.params)}</div>)}
    </div>
  );
}

// ------------------------------------------------------------------ choices

function ChoicePanel({ g, me, act }: { g: PublicGameState; me: string; act: (a: Action) => void }) {
  const { u, card } = useI18n();
  const pc = g.pending[0];
  const meP = g.players.find((p) => p.id === me)!;
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<{ pid: string; cardId: string } | null>(null);
  if (!pc || pc.playerId !== me) return null;

  if (pc.kind === 'moving_company') {
    const to = g.players.find((p) => p.id === pc.toPlayerId)!;
    return (
      <Modal open>
        <h3 className="mb-1 text-xl font-bold">🚚 {card('moving_company')}</h3>
        <p className="mb-4 text-slate-600">{u('mc_body', { name: to.name })}</p>
        <div className="mb-4 flex flex-wrap gap-3">
          {sortedEstablishments(meP).map(([id, n]) => (
            <CardTile key={id} cardId={id} count={n} size="sm" highlight={give === id} onClick={() => setGive(id)} />
          ))}
        </div>
        <Button disabled={!give} onClick={() => give && act({ type: 'give', cardId: give })} className="w-full">{u('give_this')}</Button>
      </Modal>
    );
  }

  const opponents = g.players.filter((p) => p.id !== me && Object.keys(p.establishments).length > 0);
  return (
    <Modal open wide>
      <h3 className="mb-1 text-xl font-bold">🏢 {card('business_center')}</h3>
      <p className="mb-3 text-slate-600">{u('bc_body')}</p>
      <div className="mb-1 text-sm font-semibold">{u('bc_step1')}</div>
      <div className="mb-4 flex flex-wrap gap-3">
        {sortedEstablishments(meP).map(([id, n]) => (
          <CardTile key={id} cardId={id} count={n} size="sm" highlight={give === id} onClick={() => setGive(id)} />
        ))}
      </div>
      <div className="mb-1 text-sm font-semibold">{u('bc_step2')}</div>
      {opponents.map((o) => (
        <div key={o.id} className="mb-3">
          <div className="mb-1 text-xs text-slate-500">{o.name}</div>
          <div className="flex flex-wrap gap-3">
            {sortedEstablishments(o).map(([id, n]) => (
              <CardTile key={id} cardId={id} count={n} size="sm" highlight={take?.pid === o.id && take.cardId === id}
                onClick={() => setTake({ pid: o.id, cardId: id })} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => act({ type: 'skip_exchange' })}>{u('no_exchange')}</Button>
        <Button disabled={!give || !take}
          onClick={() => give && take && act({ type: 'exchange', giveCardId: give, targetPlayerId: take.pid, takeCardId: take.cardId })}>
          {u('exchange')}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ board

/** Shown to everyone while the player whose turn it is is disconnected. */
function OfflineBanner({ room, me, onSkip, onRemove }: { room: RoomView; me: string; onSkip: () => void; onRemove: (id: string) => void }) {
  const { u } = useI18n();
  const g = room.game!;
  const active = g.players[g.activeIndex];
  const lp = room.players.find((p) => p.id === active.id);
  const offline = g.phase !== 'ended' && lp?.connected === false;
  // Translate server time into local time once per update to tolerate clock skew.
  const [offset] = useState(() => room.serverNow - Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [offline]);
  if (!offline) return null;
  const left = room.autoSkipAt ? Math.max(0, Math.ceil((room.autoSkipAt - (now + offset)) / 1000)) : null;
  return (
    <div className="pop-in mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-amber-900 shadow-sm ring-1 ring-amber-300 sm:mx-4">
      <span className="text-xl">📡</span>
      <p className="flex-1 text-sm">
        <b>{u('offline_banner', { name: active.name })}</b>
        {left !== null && <span className="tabular-nums">{u('auto_skip_in', { n: left })}</span>}
        <span className="block text-xs text-amber-800/80">{u('missed_info', { n: lp?.missedTurns ?? 0, max: MAX_MISSED_TURNS })}</span>
      </p>
      {room.hostId === me && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onRemove(active.id)} className="py-1.5 text-sm text-rose-700">{u('remove_from_game')}</Button>
          <Button variant="gold" onClick={onSkip} className="py-1.5 text-sm">{u('skip_now')}</Button>
        </div>
      )}
    </div>
  );
}

export function Board({ room, me, conn, act, onLeave, onSkipTurn, onRemovePlayer }: {
  room: RoomView; me: string; conn: ConnState; act: (a: Action) => void; onLeave: () => void;
  onSkipTurn: () => void; onRemovePlayer: (playerId: string) => void;
}) {
  const { u, m, card } = useI18n();
  const phaseLabel = usePhaseLabel();
  const [g, reveal] = useRevealedGame(room.game!);
  const revealing = reveal.stage !== 'idle';
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [cardModal, setCardModal] = useState<string | null>(null);
  const [viewPlayer, setViewPlayer] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const active = g.players[g.activeIndex];
  const myTurn = active.id === me && !revealing;
  const meP = g.players.find((p) => p.id === me);
  const winner = revealing ? undefined : g.players.find((p) => p.id === g.winnerId);
  const canBuildPhase = myTurn && (g.phase === 'build' || g.phase === 'setup');

  // Players ordered starting from me, so my opponents read in turn order.
  const ordered = useMemo(() => {
    const i = Math.max(0, g.players.findIndex((p) => p.id === me));
    return [...g.players.slice(i), ...g.players.slice(0, i)];
  }, [g.players, me]);

  const blockerKey = cardModal ? (myTurn ? buildBlocker(asState(g), me, cardModal) : 'err_not_your_turn') : null;
  const inMarket = cardModal ? g.market.low.concat(g.market.high, g.market.landmark).some((x) => x.cardId === cardModal) : false;
  const lastLog = g.log.at(-1);

  // ---- sound effects
  useEffect(() => {
    if (reveal.stage === 'rolling') playDiceRoll(reveal.dice);
  }, [reveal.stage]);
  // Build sounds for anyone's build, as the entry appears in the (revealed) log.
  const lastSeq = g.log.at(-1)?.seq ?? 0;
  const prevSeq = useRef(lastSeq);
  useEffect(() => {
    const fresh = g.log.filter((e) => e.seq > prevSeq.current);
    prevSeq.current = lastSeq;
    if (fresh.some((e) => e.key === 'build_landmark')) playLandmark();
    else if (fresh.some((e) => e.key === 'build')) playBuild();
  }, [lastSeq]);

  // Background music while the game is running; fades out when the game ends or you leave.
  const gameOver = !!winner || g.phase === 'ended';
  useEffect(() => {
    if (gameOver) { stopMusic(1.5); return; }
    startMusic();
    return () => stopMusic();
  }, [gameOver]);

  // End-of-game sound, once, when the victory screen appears (after the final roll is revealed).
  const winnerId = winner?.id ?? null;
  const prevWinner = useRef(winnerId); // no sound when reopening a game that had already ended
  useEffect(() => {
    if (winnerId && !prevWinner.current) (winnerId === me ? playVictory : playGameOver)();
    prevWinner.current = winnerId;
  }, [winnerId]);

  // Coin sound when *my* displayed coins go up (after the dice reveal, so it lines up with the number).
  const myCoins = meP?.coins ?? 0;
  const prevCoins = useRef(myCoins);
  useEffect(() => {
    if (myCoins > prevCoins.current) playCoin();
    prevCoins.current = myCoins;
  }, [myCoins]);
  const myTurnKey = myTurn && (g.phase === 'roll' || g.phase === 'setup') ? `${g.turn}:${g.setupRound}:${g.activeIndex}` : null;
  const prevTurnKey = useRef<string | null>(myTurnKey); // no chime for a turn already in progress on load
  useEffect(() => {
    if (myTurnKey && myTurnKey !== prevTurnKey.current) playYourTurn();
    prevTurnKey.current = myTurnKey;
  }, [myTurnKey]);

  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col pb-28 lg:pb-4">
      {/* top bar */}
      <header className="sticky top-0 z-30 bg-felt/95 text-white shadow-md backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
          <button onClick={onLeave} className="text-sm opacity-80 hover:opacity-100" aria-label={u('leave_aria')}>{u('leave')}</button>
          <div className="text-sm">{u('room')} <b className="tracking-widest">{room.code}</b></div>
          {room.deckMode === 'DEMO_ONLY' && <DemoBadge />}
          <LangToggle />
          <SoundSettings />
          {conn !== 'open' && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">{u('reconnecting')}</span>}
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-xs opacity-80">{revealing ? u('phase_rolling') : phaseLabel(g)} · {u('turn_n', { n: g.turn })}</div>
              <div className="font-semibold">{active.id === me ? u('your_turn') : u('turn_of', { name: active.name })}</div>
            </div>
            <Dice g={g} reveal={reveal} />
          </div>
        </div>
      </header>

      {/* player strip */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-3 sm:px-4">
        {ordered.map((p) => <PlayerChip key={p.id} p={p} g={g} room={room} me={me} onClick={() => setViewPlayer(p.id)} />)}
      </div>

      <OfflineBanner key={`${room.version}:${room.serverNow}`} room={room} me={me} onSkip={onSkipTurn} onRemove={setConfirmRemove} />

      <div className="grid flex-1 gap-4 px-3 sm:px-4 lg:grid-cols-[1fr_340px]">
        <main className="min-w-0 space-y-4">
          <Market g={g} me={me} interactive={!revealing} onCard={setCardModal} />
          {meP && (
            <section className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">{u('my_city')}</h3>
                <Coin n={meP.coins} bump />
              </div>
              <SymbolSummary establishments={meP.establishments} className="mb-2 px-1" />
              <Tableau p={meP} onCard={setCardModal} />
            </section>
          )}
        </main>

        <aside className="hidden min-h-0 flex-col gap-4 lg:flex">
          <section className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-2 font-semibold text-slate-700">{u('other_cities')}</h3>
            <div className="space-y-3">
              {ordered.filter((p) => p.id !== me).map((p) => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <button className="font-medium hover:underline" onClick={() => setViewPlayer(p.id)}>{p.name}</button><Coin n={p.coins} />
                  </div>
                  <SymbolSummary establishments={p.establishments} className="mb-1" />
                  <ScrollRow className="px-2 pb-2 pt-3">
                    {p.landmarks.map((l) => <CardTile key={l} cardId={l} size="sm" onClick={() => setCardModal(l)} />)}
                    {sortedEstablishments(p).map(([id, n]) => (
                      <CardTile key={id} cardId={id} count={n} size="sm" onClick={() => setCardModal(id)} />
                    ))}
                  </ScrollRow>
                </div>
              ))}
            </div>
          </section>
          <section className="flex max-h-[50vh] min-h-[200px] flex-col rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-2 font-semibold text-slate-700">{u('event_log')}</h3>
            <Log g={g} />
          </section>
        </aside>
      </div>

      {/* action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:sticky lg:mx-4 lg:mt-4 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button onClick={() => setLogOpen(true)} className="block w-full truncate px-4 pt-2 text-left text-xs text-slate-500 lg:hidden">
          📜 {lastLog && m(lastLog.key, lastLog.params)}
        </button>
        <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
          {revealing && <p className="flex-1 font-semibold text-teal-800">🎲 {u('phase_rolling')}</p>}
          {!revealing && active.id !== me && g.phase !== 'ended' && (
            <p className="flex-1 text-slate-600">{u('waiting_for', { name: active.name, phase: phaseLabel(g) })}</p>
          )}
          {myTurn && g.phase === 'roll' && (
            <>
              <p className="hidden flex-1 font-semibold text-teal-800 sm:block">{u('choose_dice')}</p>
              <Button onClick={() => act({ type: 'roll', dice: 1 })} className="flex-1 sm:flex-none">{u('roll_1')}</Button>
              <Button onClick={() => act({ type: 'roll', dice: 2 })} className="flex-1 sm:flex-none">{u('roll_2')}</Button>
            </>
          )}
          {canBuildPhase && (
            <>
              <p className="flex-1 text-sm text-slate-700">{u(g.phase === 'setup' ? 'setup_hint' : 'build_hint')}</p>
              <Button variant="secondary" onClick={() => act({ type: 'pass' })}>{u('pass_end')}</Button>
            </>
          )}
          {myTurn && g.phase === 'choice' && <p className="flex-1 text-slate-700">{u('waiting_choice')}</p>}
        </div>
      </div>

      {g.phase === 'choice' && !revealing && <ChoicePanel key={g.log.length} g={g} me={me} act={act} />}

      <Modal open={!!cardModal} onClose={() => setCardModal(null)}>
        {cardModal && (
          <>
            <CardDetail cardId={cardModal} />
            {inMarket && meP && (
              <div className="mt-4 border-t pt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{u('price_for_you')}</span><Coin n={costOf(asState(g), meP, cardModal)} />
                </div>
                {blockerKey && <p className="mb-2 text-sm text-rose-600">{m(blockerKey)}</p>}
                <Button variant="gold" className="w-full" disabled={!!blockerKey}
                  onClick={() => { act({ type: 'build', cardId: cardModal }); setCardModal(null); }}>
                  {u('build_x', { name: card(cardModal) })}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!viewPlayer} onClose={() => setViewPlayer(null)} wide>
        {viewPlayer && (() => {
          const p = g.players.find((x) => x.id === viewPlayer);
          if (!p) return null;
          return (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold">{u('city_of', { name: p.name })}</h3><Coin n={p.coins} />
              </div>
              <SymbolSummary establishments={p.establishments} className="mb-2" />
              <Tableau p={p} compact onCard={(id) => { setViewPlayer(null); setCardModal(id); }} />
              {room.hostId === me && p.id !== me && g.phase !== 'ended' && room.players.find((x) => x.id === p.id)?.connected === false && (
                <Button variant="secondary" className="mt-4 w-full text-rose-700"
                  onClick={() => { setViewPlayer(null); setConfirmRemove(p.id); }}>
                  {u('remove_x', { name: p.name })}
                </Button>
              )}
            </>
          );
        })()}
      </Modal>

      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)}>
        {confirmRemove && (() => {
          const p = g.players.find((x) => x.id === confirmRemove);
          return (
            <>
              <h3 className="mb-2 text-xl font-bold">{u('remove_q', { name: p?.name ?? '' })}</h3>
              <p className="mb-5 text-slate-600">
                {u('remove_body')}{g.players.length - 1 < 2 && u('remove_last')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirmRemove(null)}>{u('cancel')}</Button>
                <Button variant="danger" onClick={() => { onRemovePlayer(confirmRemove); setConfirmRemove(null); }}>{u('remove')}</Button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)}>
        <h3 className="mb-3 text-lg font-bold">{u('event_log')}</h3>
        <div className="max-h-[60vh]"><Log g={g} /></div>
      </Modal>

      {winner && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
          <div className="pop-in w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-7xl">🏆</div>
            <h2 className="mt-2 text-3xl font-bold text-amber-600">{winner.id === me ? u('you_win') : u('x_wins', { name: winner.name })}</h2>
            <p className="mt-1 text-slate-600">{lastLog && m(lastLog.key, lastLog.params)}</p>
            <ul className="my-5 space-y-2 text-left">
              {[...g.players].sort((a, b) => b.landmarks.length - a.landmarks.length || b.coins - a.coins).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-sm">🏗️ {p.landmarks.length}</span>
                  <Coin n={p.coins} />
                </li>
              ))}
            </ul>
            <Button onClick={onLeave} className="w-full">{u('back_home')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
