import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type RoomView } from '@mk2/game-engine';
import { Button, DemoBadge } from './ui';

export function Lobby({ room, me, onStart, onLeave, onTransferHost, onKick }: {
  room: RoomView; me: string; onStart: () => void; onLeave: () => void;
  onTransferHost: (playerId: string) => void; onKick: (playerId: string) => void;
}) {
  const [confirm, setConfirm] = useState<{ id: string; kind: 'host' | 'kick' } | null>(null);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === me;
  const link = `${location.origin}${location.pathname}#/room/${room.code}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const enough = room.players.length >= MIN_PLAYERS;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="pop-in w-full max-w-md rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-black/5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-teal-900">ห้องรอเล่น</h2>
          {room.deckMode === 'DEMO_ONLY' && <DemoBadge />}
        </div>
        <div className="mb-5 rounded-2xl bg-teal-50 p-4 text-center">
          <div className="text-sm text-teal-700">รหัสห้อง</div>
          <div className="text-4xl font-bold tracking-[0.3em] text-teal-900">{room.code}</div>
          <Button variant="secondary" onClick={copy} className="mt-3 text-sm">{copied ? 'คัดลอกแล้ว ✓' : '🔗 คัดลอกลิงก์เชิญ'}</Button>
        </div>

        <div className="mb-2 text-sm font-medium text-slate-600">ผู้เล่น ({room.players.length}/{MAX_PLAYERS})</div>
        <ul className="mb-5 space-y-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} title={p.connected ? 'ออนไลน์' : 'ออฟไลน์'} />
              <span className="flex-1 font-medium">{p.name}{p.id === me && <span className="text-slate-400"> (คุณ)</span>}</span>
              {p.isHost && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">👑 หัวห้อง</span>}
              {isHost && !p.isHost && (
                confirm?.id === p.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => { (confirm.kind === 'host' ? onTransferHost : onKick)(p.id); setConfirm(null); }}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold text-white ${confirm.kind === 'host' ? 'bg-amber-500' : 'bg-rose-600'}`}>
                      {confirm.kind === 'host' ? 'ยืนยันมอบ' : 'ยืนยันเชิญออก'}
                    </button>
                    <button onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate-500">ยกเลิก</button>
                  </span>
                ) : (
                  <span className="flex gap-1">
                    <button onClick={() => setConfirm({ id: p.id, kind: 'host' })}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200 hover:bg-teal-50">มอบหัวห้อง</button>
                    <button onClick={() => setConfirm({ id: p.id, kind: 'kick' })} aria-label={`เชิญ ${p.name} ออกจากห้อง`}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">เชิญออก</button>
                  </span>
                )
              )}
            </li>
          ))}
          {Array.from({ length: MAX_PLAYERS - room.players.length }).map((_, i) => (
            <li key={i} className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">ว่าง</li>
          ))}
        </ul>

        {isHost ? (
          <Button onClick={onStart} disabled={!enough} className="w-full py-3 text-lg">
            {enough ? 'เริ่มเกม' : `รอผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน`}
          </Button>
        ) : (
          <p className="rounded-xl bg-slate-100 p-3 text-center text-slate-600">รอหัวห้องเริ่มเกม…</p>
        )}
        <Button variant="ghost" onClick={onLeave} className="mt-2 w-full text-sm">🚪 ออกจากห้อง</Button>
        {isHost && room.players.length > 1 && (
          <p className="mt-1 text-center text-xs text-slate-400">ถ้าหัวห้องออก ตำแหน่งจะโอนให้ผู้เล่นคนถัดไปอัตโนมัติ</p>
        )}
      </div>
    </div>
  );
}
