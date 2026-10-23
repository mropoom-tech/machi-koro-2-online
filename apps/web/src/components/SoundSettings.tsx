import { useEffect, useRef, useState } from 'react';
import { getVolume, isMuted, playBuild, playCoin, playDiceRoll, playLandmark, playVictory, playYourTurn, setMuted, setVolume } from '../sound';
import { useI18n } from '../i18n';

/** Header button that opens a small panel: volume slider, − / + buttons, mute, and test sounds. */
export function SoundSettings({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { u } = useI18n();
  const [open, setOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [volume, setVolumeState] = useState(() => Math.round(getVolume() * 100));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const volumeRef = useRef(volume);
  const changeVolume = (v: number | ((prev: number) => number)) => {
    const next = Math.min(100, Math.max(0, typeof v === 'function' ? v(volumeRef.current) : v));
    volumeRef.current = next;
    setVolumeState(next);
    setVolume(next / 100);
    if (next > 0 && muted) { setMuted(false); setMutedState(false); }
  };
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted); };
  const icon = muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 75 ? '🔉' : '🔊';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={u('sound_settings')}
        title={u('sound_settings')}
        className="rounded-full px-2 py-0.5 text-lg leading-none opacity-90 ring-1 ring-white/30 hover:opacity-100">
        {icon}
      </button>
      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-2 w-72 rounded-2xl bg-white p-4 text-slate-800 shadow-2xl ring-1 ring-black/10`}>
          <div className="mb-2 font-semibold">{u('sound_settings')}</div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-600">🔔 {u('sfx')}</span>
            <span className="tabular-nums text-slate-500">{muted ? u('muted') : `${volume}%`}</span>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => changeVolume((v) => v - 10)} aria-label={u('volume_down')}
              className="h-8 w-8 shrink-0 rounded-full bg-slate-100 text-lg font-bold hover:bg-slate-200">−</button>
            <input type="range" min={0} max={100} step={5} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))} aria-label={u('volume')}
              className="h-2 flex-1 cursor-pointer accent-teal-700" />
            <button type="button" onClick={() => changeVolume((v) => v + 10)} aria-label={u('volume_up')}
              className="h-8 w-8 shrink-0 rounded-full bg-slate-100 text-lg font-bold hover:bg-slate-200">+</button>
          </div>
          <button type="button" onClick={toggleMute}
            className={`mb-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${muted ? 'bg-rose-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {muted ? `🔊 ${u('unmute')}` : `🔇 ${u('mute_all')}`}
          </button>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button type="button" onClick={() => playDiceRoll(2)} disabled={muted}
              className="rounded-lg bg-teal-50 px-2 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40">🎲 {u('test_dice')}</button>
            <button type="button" onClick={() => playYourTurn()} disabled={muted}
              className="rounded-lg bg-teal-50 px-2 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40">🔔 {u('test_turn')}</button>
            <button type="button" onClick={() => playCoin()} disabled={muted}
              className="rounded-lg bg-teal-50 px-2 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40">🪙 {u('test_coin')}</button>
            <button type="button" onClick={() => playBuild()} disabled={muted}
              className="rounded-lg bg-teal-50 px-2 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40">🔨 {u('test_build')}</button>
            <button type="button" onClick={() => playLandmark()} disabled={muted}
              className="col-span-2 rounded-lg bg-teal-50 px-2 py-1.5 font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-40">🏛️ {u('test_landmark')}</button>
            <button type="button" onClick={() => playVictory()} disabled={muted}
              className="col-span-3 rounded-lg bg-amber-50 px-2 py-1.5 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40">🏆 {u('test_victory')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
