import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildBlocker, costOf, getCard, getEst, LANDMARKS_TO_WIN, MAX_MISSED_TURNS, SETUP_ROUNDS,
  type Action, type GameState, type PlayerState, type PublicGameState, type Row, type RoomView,
} from '@mk2/game-engine';
import { CardDetail, CardTile, cardIcon } from './Card';
import { Button, Coin, DemoBadge, Modal } from './ui';
import type { ConnState } from '../net';

const ROW_LABEL: Record<Row, string> = { low: 'กิจการ 1–6', high: 'กิจการ 7–12', landmark: 'แลนด์มาร์ก' };
// pip positions on a 3x3 grid (0..8) for faces 1..6
const PIPS: number[][] = [[], [4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <div className={`grid h-11 w-11 grid-cols-3 grid-rows-3 gap-0.5 rounded-xl bg-white p-1.5 shadow-lg ${rolling ? 'dice-rolling' : 'pop-in'}`}
      aria-label={`ลูกเต๋า ${value}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`m-auto h-2 w-2 rounded-full ${PIPS[value].includes(i) ? (value === 1 ? 'bg-rose-600' : 'bg-slate-800') : ''}`} />
      ))}
    </div>
  );
}

// Client-side helpers reuse engine rules for hints only — the server re-validates everything.
const asState = (g: PublicGameState) => g as unknown as GameState;

function phaseLabel(g: PublicGameState): string {
  switch (g.phase) {
    case 'setup': return `ช่วงสร้างเริ่มต้น รอบ ${g.setupRound}/${SETUP_ROUNDS}`;
    case 'roll': return 'ทอยลูกเต๋า';
    case 'choice': return 'เลือกความสามารถ';
    case 'build': return 'สร้างการ์ด';
    case 'ended': return 'จบเกม';
  }
}

function sortedEstablishments(p: PlayerState): [string, number][] {
  return Object.entries(p.establishments).sort(
    ([a], [b]) => getEst(a).activation[0] - getEst(b).activation[0] || a.localeCompare(b),
  );
}

// ------------------------------------------------------------------ dice

function Dice({ g }: { g: PublicGameState }) {
  const [rolling, setRolling] = useState(false);
  const key = g.lastRoll ? `${g.turn}:${g.lastRoll.dice.join(',')}` : null;
  const prev = useRef<string | null>(key);
  useEffect(() => {
    if (key && key !== prev.current) {
      setRolling(true);
      const t = setTimeout(() => setRolling(false), 650);
      prev.current = key;
      return () => clearTimeout(t);
    }
    prev.current = key;
  }, [key]);
  if (!g.lastRoll) return <div className="flex h-14 items-center text-sm text-white/70">ยังไม่ได้ทอย</div>;
  return (
    <div className="flex items-center gap-2">
      {g.lastRoll.dice.map((d, i) => (
        <DieFace key={i} value={rolling ? ((d + i + 2) % 6) + 1 : d} rolling={rolling} />
      ))}
      {!rolling && g.lastRoll.dice.length > 1 && (
        <div className="pop-in ml-1 text-2xl font-bold text-white drop-shadow">= {g.lastRoll.total}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function PlayerChip({ p, g, room, me, onClick }: { p: PlayerState; g: PublicGameState; room: RoomView; me: string; onClick: () => void }) {
  const isActive = g.players[g.activeIndex]?.id === p.id;
  const lp = room.players.find((x) => x.id === p.id);
  const online = lp?.connected;
  return (
    <button onClick={onClick}
      className={`flex min-w-[140px] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left shadow-sm ring-1 transition
        ${isActive ? 'turn-glow bg-amber-50 ring-amber-400' : 'bg-white ring-black/5'} hover:shadow-md`}>
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{p.name.slice(0, 2)}</div>
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{p.name}{p.id === me && <span className="text-slate-400"> (คุณ)</span>}</div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Coin n={p.coins} bump />
          <span title="แลนด์มาร์ก">🏗️ {p.landmarks.length}/{LANDMARKS_TO_WIN}</span>
          {!!lp?.missedTurns && <span className="text-amber-700" title="เทิร์นที่ถูกข้าม">⏭️ {lp.missedTurns}/{MAX_MISSED_TURNS}</span>}
        </div>
      </div>
    </button>
  );
}

function Tableau({ p, onCard, compact }: { p: PlayerState; onCard: (id: string) => void; compact?: boolean }) {
  const est = sortedEstablishments(p);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3">
        {Array.from({ length: LANDMARKS_TO_WIN }).map((_, i) => {
          const id = p.landmarks[i];
          return id ? (
            <CardTile key={id} cardId={id} size="sm" cost={undefined} onClick={() => onCard(id)} />
          ) : (
            <div key={i} className="flex h-[92px] w-[76px] items-center justify-center rounded-xl border-2 border-dashed border-orange-300/70 text-xs text-orange-400">
              แลนด์มาร์ก {i + 1}
            </div>
          );
        })}
      </div>
      {est.length === 0 ? (
        <p className="py-3 text-sm text-slate-500">ยังไม่มีกิจการ</p>
      ) : (
        <div className={`flex gap-3 px-2 pb-3 pt-3 ${compact ? 'flex-wrap' : 'no-scrollbar overflow-x-auto'}`}>
          {est.map(([id, n]) => <CardTile key={id} cardId={id} count={n} size="sm" onClick={() => onCard(id)} />)}
        </div>
      )}
    </div>
  );
}

function Market({ g, me, onCard }: { g: PublicGameState; me: string; onCard: (id: string) => void }) {
  const myTurn = g.players[g.activeIndex]?.id === me;
  const meP = g.players.find((p) => p.id === me);
  return (
    <div className="space-y-3">
      {(['low', 'high', 'landmark'] as Row[]).map((row) => (
        <section key={row} className="rounded-2xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">{ROW_LABEL[row]}</span>
            <span className="text-xs text-slate-500">กองเหลือ {g.deckCounts[row]} ใบ</span>
          </div>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-3 pb-3 pt-3">
            {g.market[row].map((m) => {
              const blocked = myTurn ? buildBlocker(asState(g), me, m.cardId) : 'not-turn';
              const cost = meP ? costOf(asState(g), meP, m.cardId) : undefined;
              return (
                <CardTile key={m.cardId} cardId={m.cardId} count={m.count} cost={cost}
                  dim={myTurn && (g.phase === 'build' || g.phase === 'setup') && !!blocked}
                  highlight={myTurn && (g.phase === 'build' || g.phase === 'setup') && !blocked}
                  onClick={() => onCard(m.cardId)} />
              );
            })}
            {g.market[row].length === 0 && <span className="py-6 text-sm text-slate-400">ตลาดว่าง</span>}
          </div>
        </section>
      ))}
    </div>
  );
}

function Log({ g, max }: { g: PublicGameState; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = max ? g.log.slice(-max) : g.log;
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [g.log.length]);
  const tone = { roll: 'text-sky-700', gain: 'text-emerald-700', pay: 'text-rose-700', build: 'text-amber-700', win: 'text-amber-600 font-bold', info: 'text-slate-600' };
  return (
    <div ref={ref} className="font-body max-h-full space-y-1 overflow-y-auto text-sm">
      {entries.map((e) => (
        <div key={e.seq} className={`pop-in ${tone[e.tone ?? 'info']}`}>{e.text}</div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ choices

function ChoicePanel({ g, me, act }: { g: PublicGameState; me: string; act: (a: Action) => void }) {
  const pc = g.pending[0];
  const meP = g.players.find((p) => p.id === me)!;
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<{ pid: string; cardId: string } | null>(null);
  if (!pc || pc.playerId !== me) return null;

  if (pc.kind === 'moving_company') {
    const to = g.players.find((p) => p.id === pc.toPlayerId)!;
    return (
      <Modal open>
        <h3 className="mb-1 text-xl font-bold">🚚 บริษัทขนย้าย</h3>
        <p className="mb-4 text-slate-600">คุณทอยได้แต้มเหมือนกัน ต้องมอบกิจการ 1 ใบให้ <b>{to.name}</b> (ผู้เล่นทางขวา)</p>
        <div className="mb-4 flex flex-wrap gap-3">
          {sortedEstablishments(meP).map(([id, n]) => (
            <CardTile key={id} cardId={id} count={n} size="sm" highlight={give === id} onClick={() => setGive(id)} />
          ))}
        </div>
        <Button disabled={!give} onClick={() => give && act({ type: 'give', cardId: give })} className="w-full">มอบการ์ดนี้</Button>
      </Modal>
    );
  }

  const opponents = g.players.filter((p) => p.id !== me && Object.keys(p.establishments).length > 0);
  return (
    <Modal open wide>
      <h3 className="mb-1 text-xl font-bold">🏢 ศูนย์ธุรกิจ</h3>
      <p className="mb-3 text-slate-600">คุณอาจแลกกิจการของคุณ 1 ใบกับกิจการของผู้เล่นอื่น 1 ใบ</p>
      <div className="mb-1 text-sm font-semibold">1. เลือกกิจการของคุณที่จะให้</div>
      <div className="mb-4 flex flex-wrap gap-3">
        {sortedEstablishments(meP).map(([id, n]) => (
          <CardTile key={id} cardId={id} count={n} size="sm" highlight={give === id} onClick={() => setGive(id)} />
        ))}
      </div>
      <div className="mb-1 text-sm font-semibold">2. เลือกกิจการที่จะรับ</div>
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
        <Button variant="secondary" onClick={() => act({ type: 'skip_exchange' })}>ไม่แลก</Button>
        <Button disabled={!give || !take}
          onClick={() => give && take && act({ type: 'exchange', giveCardId: give, targetPlayerId: take.pid, takeCardId: take.cardId })}>
          แลกเปลี่ยน
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ board

/** Shown to everyone while the player whose turn it is is disconnected. */
function OfflineBanner({ room, me, onSkip, onRemove }: { room: RoomView; me: string; onSkip: () => void; onRemove: (id: string) => void }) {
  const g = room.game!;
  const active = g.players[g.activeIndex];
  const lp = room.players.find((p) => p.id === active.id);
  const offline = g.phase !== 'ended' && lp?.connected === false;
  const missed = lp?.missedTurns ?? 0;
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
        <b>{active.name}</b> หลุดการเชื่อมต่อ
        {left !== null && <> — จะข้ามเทิร์นอัตโนมัติใน <b className="tabular-nums">{left}</b> วินาที</>}
        <span className="block text-xs text-amber-800/80">
          ถูกข้ามแล้ว {missed}/{MAX_MISSED_TURNS} เทิร์นติดกัน — ครบแล้วจะถูกนำออกจากเกมอัตโนมัติ
        </span>
      </p>
      {room.hostId === me && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onRemove(active.id)} className="py-1.5 text-sm text-rose-700">🚪 นำออกจากเกม</Button>
          <Button variant="gold" onClick={onSkip} className="py-1.5 text-sm">⏭️ ข้ามเทิร์นตอนนี้</Button>
        </div>
      )}
    </div>
  );
}

export function Board({ room, me, conn, act, onLeave, onSkipTurn, onRemovePlayer }: {
  room: RoomView; me: string; conn: ConnState; act: (a: Action) => void; onLeave: () => void;
  onSkipTurn: () => void; onRemovePlayer: (playerId: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const g = room.game!;
  const [cardModal, setCardModal] = useState<string | null>(null);
  const [viewPlayer, setViewPlayer] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const active = g.players[g.activeIndex];
  const myTurn = active.id === me;
  const meP = g.players.find((p) => p.id === me);
  const winner = g.players.find((p) => p.id === g.winnerId);
  const canBuildPhase = myTurn && (g.phase === 'build' || g.phase === 'setup');

  // Players ordered starting from me, so my opponents read in turn order.
  const ordered = useMemo(() => {
    const i = Math.max(0, g.players.findIndex((p) => p.id === me));
    return [...g.players.slice(i), ...g.players.slice(0, i)];
  }, [g.players, me]);

  const modalBlocker = cardModal ? (myTurn ? buildBlocker(asState(g), me, cardModal) : 'ยังไม่ถึงเทิร์นของคุณ') : null;
  const inMarket = cardModal ? g.market.low.concat(g.market.high, g.market.landmark).some((m) => m.cardId === cardModal) : false;

  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col pb-28 lg:pb-4">
      {/* top bar */}
      <header className="sticky top-0 z-30 bg-felt/95 text-white shadow-md backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
          <button onClick={onLeave} className="text-sm opacity-80 hover:opacity-100" aria-label="ออกจากห้อง">← ออก</button>
          <div className="text-sm">ห้อง <b className="tracking-widest">{room.code}</b></div>
          {room.deckMode === 'DEMO_ONLY' && <DemoBadge />}
          {conn !== 'open' && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">กำลังเชื่อมต่อใหม่…</span>}
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-xs opacity-80">{phaseLabel(g)} · เทิร์น {g.turn}</div>
              <div className="font-semibold">{myTurn ? '🎯 ตาของคุณ!' : `ตาของ ${active.name}`}</div>
            </div>
            <Dice g={g} />
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
          <Market g={g} me={me} onCard={setCardModal} />
          {meP && (
            <section className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">เมืองของฉัน</h3>
                <Coin n={meP.coins} bump />
              </div>
              <Tableau p={meP} onCard={setCardModal} />
            </section>
          )}
        </main>

        <aside className="hidden min-h-0 flex-col gap-4 lg:flex">
          <section className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-2 font-semibold text-slate-700">เมืองของผู้เล่นอื่น</h3>
            <div className="space-y-3">
              {ordered.filter((p) => p.id !== me).map((p) => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span><Coin n={p.coins} />
                  </div>
                  <div className="flex flex-wrap gap-1 text-lg">
                    {p.landmarks.map((l) => <span key={l} title={getCard(l).nameTh} className="cursor-pointer" onClick={() => setCardModal(l)}>{cardIcon(l)}</span>)}
                    {sortedEstablishments(p).map(([id, n]) => (
                      <button key={id} onClick={() => setCardModal(id)} title={getCard(id).nameTh}
                        className="rounded-md bg-slate-100 px-1 text-sm">{cardIcon(id)}{n > 1 && <sub>{n}</sub>}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="flex max-h-[50vh] min-h-[200px] flex-col rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-2 font-semibold text-slate-700">บันทึกเหตุการณ์</h3>
            <Log g={g} />
          </section>
        </aside>
      </div>

      {/* action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:sticky lg:mx-4 lg:mt-4 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button onClick={() => setLogOpen(true)} className="block w-full truncate px-4 pt-2 text-left text-xs text-slate-500 lg:hidden">
          📜 {g.log.at(-1)?.text}
        </button>
        <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
          {!myTurn && g.phase !== 'ended' && <p className="flex-1 text-slate-600">รอ <b>{active.name}</b> {phaseLabel(g)}…</p>}
          {myTurn && g.phase === 'roll' && (
            <>
              <p className="hidden flex-1 font-semibold text-teal-800 sm:block">เลือกจำนวนลูกเต๋า</p>
              <Button onClick={() => act({ type: 'roll', dice: 1 })} className="flex-1 sm:flex-none">🎲 ทอย 1 ลูก</Button>
              <Button onClick={() => act({ type: 'roll', dice: 2 })} className="flex-1 sm:flex-none">🎲🎲 ทอย 2 ลูก</Button>
            </>
          )}
          {canBuildPhase && (
            <>
              <p className="flex-1 text-sm text-slate-700">
                {g.phase === 'setup' ? 'เลือกกิจการเริ่มต้นจากตลาด (ไม่บังคับ)' : 'แตะการ์ดในตลาดเพื่อสร้าง (เทิร์นละ 1 ใบ)'}
              </p>
              <Button variant="secondary" onClick={() => act({ type: 'pass' })}>ไม่สร้าง · จบเทิร์น</Button>
            </>
          )}
          {myTurn && g.phase === 'choice' && <p className="flex-1 text-slate-700">กำลังรอการเลือกของคุณ…</p>}
        </div>
      </div>

      {g.phase === 'choice' && <ChoicePanel key={g.log.length} g={g} me={me} act={act} />}

      <Modal open={!!cardModal} onClose={() => setCardModal(null)}>
        {cardModal && (
          <>
            <CardDetail cardId={cardModal} />
            {inMarket && meP && (
              <div className="mt-4 border-t pt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>ราคาสำหรับคุณ</span><Coin n={costOf(asState(g), meP, cardModal)} />
                </div>
                {modalBlocker && <p className="mb-2 text-sm text-rose-600">{modalBlocker}</p>}
                <Button variant="gold" className="w-full" disabled={!!modalBlocker}
                  onClick={() => { act({ type: 'build', cardId: cardModal }); setCardModal(null); }}>
                  สร้าง {getCard(cardModal).nameTh}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!viewPlayer} onClose={() => setViewPlayer(null)} wide>
        {viewPlayer && (() => {
          const p = g.players.find((x) => x.id === viewPlayer)!;
          return (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold">เมืองของ {p.name}</h3><Coin n={p.coins} />
              </div>
              <Tableau p={p} compact onCard={(id) => { setViewPlayer(null); setCardModal(id); }} />
              {room.hostId === me && p.id !== me && g.phase !== 'ended' && room.players.find((x) => x.id === p.id)?.connected === false && (
                <Button variant="secondary" className="mt-4 w-full text-rose-700"
                  onClick={() => { setViewPlayer(null); setConfirmRemove(p.id); }}>
                  🚪 นำ {p.name} ออกจากเกม (หลุดการเชื่อมต่อ)
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
              <h3 className="mb-2 text-xl font-bold">นำ {p?.name} ออกจากเกม?</h3>
              <p className="mb-5 text-slate-600">
                กิจการและแลนด์มาร์กทั้งหมดของผู้เล่นนี้จะออกจากเกม เหรียญคืนธนาคาร และกลับเข้าเกมนี้ไม่ได้อีก
                {g.players.length - 1 < 2 && ' — เหลือผู้เล่นคนเดียว เกมจะจบและผู้เล่นที่เหลือชนะ'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirmRemove(null)}>ยกเลิก</Button>
                <Button variant="danger" onClick={() => { onRemovePlayer(confirmRemove); setConfirmRemove(null); }}>
                  นำออก
                </Button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)}>
        <h3 className="mb-3 text-lg font-bold">บันทึกเหตุการณ์</h3>
        <div className="max-h-[60vh]"><Log g={g} /></div>
      </Modal>

      {winner && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
          <div className="pop-in w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-7xl">🏆</div>
            <h2 className="mt-2 text-3xl font-bold text-amber-600">{winner.id === me ? 'คุณชนะ!' : `${winner.name} ชนะ!`}</h2>
            <p className="mt-1 text-slate-600">{g.log.at(-1)?.text}</p>
            <ul className="my-5 space-y-2 text-left">
              {[...g.players].sort((a, b) => b.landmarks.length - a.landmarks.length || b.coins - a.coins).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-sm">🏗️ {p.landmarks.length}</span>
                  <Coin n={p.coins} />
                </li>
              ))}
            </ul>
            <Button onClick={onLeave} className="w-full">กลับหน้าแรก</Button>
          </div>
        </div>
      )}
    </div>
  );
}
