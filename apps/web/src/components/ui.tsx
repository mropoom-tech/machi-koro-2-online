import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { hasMessage } from '@mk2/game-engine';
import { useI18n } from '../i18n';
import type { Note } from '../net';

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`slide-up sm:pop-in max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </div>
  );
}

export function Button({
  children, onClick, variant = 'primary', disabled, className = '', type = 'button',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger';
  disabled?: boolean; className?: string; type?: 'button' | 'submit';
}) {
  const v = {
    primary: 'bg-felt text-white hover:bg-teal-800 shadow-md',
    gold: 'bg-coin text-amber-950 hover:bg-amber-400 shadow-md',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-md',
    secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-black/5',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Coin({ n, bump }: { n: number; bump?: boolean }) {
  return (
    <span key={bump ? n : undefined} className={`inline-flex items-center gap-1 font-bold tabular-nums ${bump ? 'coin-bump' : ''}`}>
      <span className="inline-block h-4 w-4 rounded-full bg-coin ring-2 ring-amber-600/40" aria-hidden />
      {n}
    </span>
  );
}

export function DemoBadge() {
  const { u } = useI18n();
  return (
    <span
      className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow"
      title={u('demo_badge_title')}
    >
      DEMO / UNVERIFIED DECK
    </span>
  );
}

/** Renders a server message key or UI key in the current language. */
export function useNoteText() {
  const { u, m } = useI18n();
  return (n: Note) => {
    if (n.ui) return u(n.ui, n.params);
    if (n.server && hasMessage(n.server)) return m(n.server, n.params);
    return u(n.server === 'net_error' ? 'net_error' : 'generic_error');
  };
}

export function Toast({ toast }: { toast: Note | null }) {
  const text = useNoteText();
  if (!toast) return null;
  return (
    <div key={toast.id} className="pop-in pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">
      {text(toast)}
    </div>
  );
}

/**
 * Horizontal card row that is easy to scroll on every device: visible scrollbar, mouse wheel scrolls
 * sideways, and ‹ › buttons appear when there is more to see.
 */
export function ScrollRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right })); // no re-render if unchanged
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    // Turn vertical wheel into horizontal scroll while the row can still move that way.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, next));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', update, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel); el.removeEventListener('scroll', update); };
  }, [update]);
  useEffect(update);
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const arrow = 'absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-xl font-bold text-slate-700 shadow-lg ring-1 ring-black/10 hover:bg-white sm:flex';
  return (
    <div className="relative">
      <div ref={ref} className={`mk-scroll flex gap-3 overflow-x-auto ${className}`}>{children}</div>
      {edges.left && <button type="button" aria-label="‹" onClick={() => nudge(-1)} className={`${arrow} -left-2`}>‹</button>}
      {edges.right && <button type="button" aria-label="›" onClick={() => nudge(1)} className={`${arrow} -right-2`}>›</button>}
    </div>
  );
}
