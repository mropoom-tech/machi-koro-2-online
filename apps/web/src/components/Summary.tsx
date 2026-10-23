import type { PublicGameState } from '@mk2/game-engine';
import { useI18n } from '../i18n';
import { Coin } from './ui';

// Distinct, colour-blind-friendly line colours (one per seat, max 5 players).
const COLORS = ['#0f766e', '#d97706', '#7c3aed', '#e11d48', '#2563eb'];

/** Coins over time for every player, plus each player's best-earning card. */
export function GameSummary({ g, me }: { g: PublicGameState; me: string }) {
  const { u, card } = useI18n();
  const stats = g.stats;
  if (!stats) return null;
  const players = g.players.filter((p) => stats.coins[p.id]?.length);
  const series = players.map((p) => stats.coins[p.id]);
  const len = Math.max(2, ...series.map((s) => s.length));
  const max = Math.max(10, ...series.flat());
  const W = 320, H = 150, PAD = 22;
  const x = (i: number) => PAD + (i / (len - 1)) * (W - PAD - 6);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD - 8);

  return (
    <div className="space-y-4 text-left">
      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-700">{u('coins_over_time')}</h4>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={u('coins_over_time')}>
          {[0, Math.round(max / 2), max].map((v) => (
            <g key={v}>
              <line x1={PAD} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
              <text x={PAD - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#64748b">{v}</text>
            </g>
          ))}
          <text x={W - 6} y={H - 6} textAnchor="end" fontSize="9" fill="#64748b">{u('turns_axis')}</text>
          {series.map((s, k) => (
            <polyline key={players[k].id} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={players[k].id === me ? 3 : 2}
              strokeLinejoin="round" points={s.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {players.map((p, k) => (
            <span key={p.id} className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm" style={{ background: COLORS[k % COLORS.length] }} />{p.name}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-700">{u('top_earners')}</h4>
        <ul className="space-y-1">
          {players.map((p) => {
            const top = Object.entries(stats.earned[p.id] ?? {}).sort((a, b) => b[1] - a[1])[0];
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="w-20 truncate font-medium">{p.name}</span>
                <span className="flex-1 truncate text-slate-600">{top ? card(top[0]) : '—'}</span>
                {top && <Coin n={top[1]} />}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
