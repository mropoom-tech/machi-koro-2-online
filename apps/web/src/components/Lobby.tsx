import { useState } from 'react';
import { BOT_LEVELS, MAX_PLAYERS, MIN_PLAYERS, TURN_TIMER_OPTIONS, type BotLevel, type RoomView } from '@mk2/game-engine';
import { Button, DemoBadge } from './ui';
import { LangToggle, useI18n } from '../i18n';
import { SoundSettings } from './SoundSettings';
import { HowToPlayButton } from './HowToPlay';

export function Lobby({ room, me, onStart, onLeave, onTransferHost, onKick, onAddBot, onSetSpectator, onSetTurnTimer }: {
  room: RoomView; me: string; onStart: () => void; onLeave: () => void;
  onTransferHost: (playerId: string) => void; onKick: (playerId: string) => void;
  onAddBot: (level: BotLevel) => void; onSetSpectator: (spectator: boolean) => void; onSetTurnTimer: (seconds: number) => void;
}) {
  const { u } = useI18n();
  const [confirm, setConfirm] = useState<{ id: string; kind: 'host' | 'kick' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState<BotLevel>('normal');
  const isHost = room.hostId === me;
  const link = `${location.origin}${location.pathname}#/room/${room.code}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const seated = room.players.filter((p) => !p.spectator);
  const spectators = room.players.filter((p) => p.spectator);
  const meSpectating = !!room.players.find((p) => p.id === me)?.spectator;
  const enough = seated.length >= MIN_PLAYERS;
  const full = seated.length >= MAX_PLAYERS;

  const row = (p: RoomView['players'][number]) => (
    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
      {p.isBot
        ? <span className="text-base leading-none" title={u('bot')}>🤖</span>
        : <span className={`h-2.5 w-2.5 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} title={u(p.connected ? 'online' : 'offline')} />}
      <span className="flex-1 font-medium">{p.name}{p.id === me && <span className="text-slate-400"> ({u('you')})</span>}
        {p.botLevel && <span className="ml-1 text-xs text-slate-500">· {u(`lvl_${p.botLevel}`)}</span>}</span>
      {p.isHost && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{u('host')}</span>}
      {isHost && !p.isHost && (
        confirm?.id === p.id ? (
          <span className="flex items-center gap-1">
            <button
              onClick={() => { (confirm.kind === 'host' ? onTransferHost : onKick)(p.id); setConfirm(null); }}
              className={`rounded-lg px-2 py-1 text-xs font-semibold text-white ${confirm.kind === 'host' ? 'bg-amber-500' : 'bg-rose-600'}`}>
              {u(confirm.kind === 'host' ? 'confirm_host' : 'confirm_kick')}
            </button>
            <button onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate-500">{u('cancel')}</button>
          </span>
        ) : p.isBot ? (
          <button onClick={() => onKick(p.id)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">{u('remove')}</button>
        ) : (
          <span className="flex gap-1">
            <button onClick={() => setConfirm({ id: p.id, kind: 'host' })}
              className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200 hover:bg-teal-50">{u('make_host')}</button>
            <button onClick={() => setConfirm({ id: p.id, kind: 'kick' })} aria-label={u('kick_aria', { name: p.name })}
              className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">{u('kick')}</button>
          </span>
        )
      )}
    </li>
  );

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="pop-in w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-black/5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="whitespace-nowrap text-2xl font-bold text-teal-900">{u('lobby_title')}</h2>
          <div className="flex items-center gap-2">
            {room.deckMode === 'DEMO_ONLY' && <DemoBadge />}
            <HowToPlayButton className="bg-teal-800 text-white" />
            <LangToggle className="bg-teal-800 text-white" />
            <div className="rounded-full bg-teal-800 text-white"><SoundSettings align="right" /></div>
          </div>
        </div>
        <div className="mb-5 rounded-2xl bg-teal-50 p-4 text-center">
          <div className="text-sm text-teal-700">{u('room_code')}</div>
          <div className="text-4xl font-bold tracking-[0.3em] text-teal-900">{room.code}</div>
          <Button variant="secondary" onClick={copy} className="mt-3 text-sm">{u(copied ? 'copied' : 'copy_invite')}</Button>
        </div>

        <div className="mb-2 text-sm font-medium text-slate-600">{u('players_count', { n: seated.length, max: MAX_PLAYERS })}</div>
        <ul className="mb-3 space-y-2">
          {seated.map(row)}
          {Array.from({ length: MAX_PLAYERS - seated.length }).map((_, i) => (
            <li key={i} className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">{u('empty_seat')}</li>
          ))}
        </ul>
        <div className="mb-5 flex flex-wrap gap-2">
          {isHost && !full && (
            <div className="flex flex-1 gap-1">
              <select value={level} onChange={(e) => setLevel(e.target.value as BotLevel)} aria-label={u('bot_level')}
                className="rounded-xl border border-slate-300 bg-white px-2 text-sm">
                {BOT_LEVELS.map((l) => <option key={l} value={l}>{u(`lvl_${l}`)}</option>)}
              </select>
              <Button variant="secondary" onClick={() => onAddBot(level)} className="flex-1 text-sm">{u('add_bot')}</Button>
            </div>
          )}
          {meSpectating
            ? <Button variant="secondary" onClick={() => onSetSpectator(false)} disabled={full} className="flex-1 text-sm">{u('move_to_player')}</Button>
            : <Button variant="secondary" onClick={() => onSetSpectator(true)} className="flex-1 text-sm">{u('move_to_spectator')}</Button>}
        </div>
        <div className="mb-5 flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-600">⏱️ {u('turn_timer')}</span>
          {isHost ? (
            <select value={room.turnSeconds} onChange={(e) => onSetTurnTimer(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-2 py-1">
              {TURN_TIMER_OPTIONS.map((s) => <option key={s} value={s}>{s ? u('timer_s', { n: s }) : u('timer_off')}</option>)}
            </select>
          ) : (
            <span>{room.turnSeconds ? u('timer_s', { n: room.turnSeconds }) : u('timer_off')}</span>
          )}
        </div>
        {spectators.length > 0 && (
          <>
            <div className="mb-2 text-sm font-medium text-slate-600">{u('spectators_count', { n: spectators.length })}</div>
            <ul className="mb-5 space-y-2">{spectators.map(row)}</ul>
          </>
        )}

        {isHost ? (
          <Button onClick={onStart} disabled={!enough} className="w-full py-3 text-lg">
            {enough ? u('start_game') : u('need_players', { n: MIN_PLAYERS })}
          </Button>
        ) : (
          <p className="rounded-xl bg-slate-100 p-3 text-center text-slate-600">{u('wait_host')}</p>
        )}
        <Button variant="ghost" onClick={onLeave} className="mt-2 w-full text-sm">{u('leave_room')}</Button>
        {isHost && room.players.length > 1 && (
          <p className="mt-1 text-center text-xs text-slate-400">{u('host_leave_hint')}</p>
        )}
      </div>
    </div>
  );
}
