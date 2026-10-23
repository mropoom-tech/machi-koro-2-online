import { useState, type FormEvent } from 'react';
import { CODE_RE, normalizeCode } from '@mk2/game-engine';
import { ApiError, createRoom, joinRoom, rememberName, savedName, saveSession, type Note, type Session } from '../net';
import { LangToggle, useI18n } from '../i18n';
import { Button, useNoteText } from './ui';

export function Landing({ initialCode, onEnter }: { initialCode?: string; onEnter: (s: Session) => void }) {
  const { u } = useI18n();
  const noteText = useNoteText();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError({ id: Date.now(), server: 'err_need_name' });
    setBusy(true); setError(null);
    try {
      rememberName(n);
      let s: Session;
      if (mode === 'create') {
        const r = await createRoom(n);
        s = { code: r.code, token: r.token, playerId: r.playerId, name: n };
      } else {
        const c = normalizeCode(code);
        if (!CODE_RE.test(c)) { setError({ id: Date.now(), ui: 'bad_code_format' }); return; }
        const r = await joinRoom(c, n);
        s = { code: c, token: r.token, playerId: r.playerId, name: n };
      }
      saveSession(s);
      onEnter(s);
    } catch (err) {
      const ae = err instanceof ApiError ? err : new ApiError('generic_error');
      setError({ id: Date.now(), server: ae.code, params: ae.params });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <LangToggle className="fixed right-4 top-4 bg-teal-800 text-white" />
      <div className="mb-8 text-center">
        <div className="mb-3 text-6xl drop-shadow-sm">🏙️🎲</div>
        <h1 className="text-4xl font-bold tracking-tight text-teal-900 sm:text-5xl">Machi Koro 2</h1>
        <p className="mt-2 text-lg text-teal-800/80">{u('tagline')}</p>
      </div>

      <form onSubmit={submit} className="pop-in w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(['create', 'join'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-lg py-2 transition ${mode === m ? 'bg-white text-teal-800 shadow' : 'text-slate-500'}`}>
              {u(m === 'create' ? 'create_room' : 'join_room')}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="nick">{u('nickname')}</label>
        <input id="nick" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname"
          placeholder={u('nickname_ph')}
          className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200" />

        {mode === 'join' && (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="code">{u('room_code')}</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5}
              placeholder="ABCDE" autoCapitalize="characters"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200" />
          </>
        )}

        {error && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{noteText(error)}</p>}
        <Button type="submit" disabled={busy} className="w-full py-3 text-lg">
          {busy ? u('working') : u(mode === 'create' ? 'create_new_room' : 'join')}
        </Button>
        <p className="mt-4 text-center text-xs text-slate-500">{u('no_signup')}</p>
      </form>
    </div>
  );
}
