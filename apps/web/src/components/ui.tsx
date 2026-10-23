import { useEffect, type ReactNode } from 'react';

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
  return (
    <span
      className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow"
      title="จำนวนสำเนาการ์ดยังไม่ได้รับการยืนยันจาก Rulebook — ใช้เพื่อทดสอบระบบเท่านั้น"
    >
      DEMO / UNVERIFIED DECK
    </span>
  );
}

export function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  if (!toast) return null;
  return (
    <div key={toast.id} className="pop-in pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">
      {toast.text}
    </div>
  );
}
