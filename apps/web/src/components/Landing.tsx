import { useState, type FormEvent } from 'react';
import { CODE_RE, normalizeCode } from '@mk2/game-engine';
import { createRoom, joinRoom, rememberName, savedName, saveSession, type Session } from '../net';
import { Button } from './ui';

export function Landing({ initialCode, onEnter }: { initialCode?: string; onEnter: (s: Session) => void }) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('กรุณาใส่ชื่อเล่น');
    setBusy(true); setError(null);
    try {
      rememberName(n);
      let s: Session;
      if (mode === 'create') {
        const r = await createRoom(n);
        s = { code: r.code, token: r.token, playerId: r.playerId, name: n };
      } else {
        const c = normalizeCode(code);
        if (!CODE_RE.test(c)) throw new Error('รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 5 ตัว');
        const r = await joinRoom(c, n);
        s = { code: c, token: r.token, playerId: r.playerId, name: n };
      }
      saveSession(s);
      onEnter(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mb-3 text-6xl drop-shadow-sm">🏙️🎲</div>
        <h1 className="text-4xl font-bold tracking-tight text-teal-900 sm:text-5xl">Machi Koro 2</h1>
        <p className="mt-2 text-lg text-teal-800/80">สร้างเมืองในฝัน เล่นออนไลน์กับเพื่อน 2–5 คน</p>
      </div>

      <form onSubmit={submit} className="pop-in w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(['create', 'join'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-lg py-2 transition ${mode === m ? 'bg-white shadow text-teal-800' : 'text-slate-500'}`}>
              {m === 'create' ? 'สร้างห้อง' : 'เข้าร่วมห้อง'}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="nick">ชื่อเล่น</label>
        <input id="nick" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname"
          placeholder="เช่น ต้นกล้า"
          className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200" />

        {mode === 'join' && (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="code">รหัสห้อง</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5}
              placeholder="ABCDE" autoCapitalize="characters"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200" />
          </>
        )}

        {error && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full py-3 text-lg">
          {busy ? 'กำลังดำเนินการ…' : mode === 'create' ? 'สร้างห้องใหม่' : 'เข้าร่วม'}
        </Button>
        <p className="mt-4 text-center text-xs text-slate-500">ไม่ต้องสมัครสมาชิก ใช้แค่ชื่อเล่น</p>
      </form>
    </div>
  );
}
