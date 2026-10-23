import { useEffect, useState } from 'react';
import { normalizeCode } from '@mk2/game-engine';
import { Landing } from './components/Landing';
import { Lobby } from './components/Lobby';
import { Board } from './components/Board';
import { Button, Modal, Toast, useNoteText } from './components/ui';
import { CardTicketContext } from './components/Card';
import { useI18n } from './i18n';
import { clearSession, loadSession, useRoom, type Session } from './net';

function codeFromHash(): string | null {
  const m = location.hash.match(/^#\/room\/([A-Za-z0-9]{5})/);
  return m ? normalizeCode(m[1]) : null;
}

export default function App() {
  const [code, setCode] = useState<string | null>(codeFromHash());
  const [session, setSession] = useState<Session | null>(() => (code ? loadSession(code) : null));

  useEffect(() => {
    const h = () => {
      const c = codeFromHash();
      setCode(c);
      setSession(c ? loadSession(c) : null);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const enter = (s: Session) => {
    setSession(s);
    setCode(s.code);
    location.hash = `#/room/${s.code}`;
  };
  const leave = () => {
    location.hash = '';
    setSession(null);
    setCode(null);
  };

  if (!session) return <Landing key={code ?? ''} initialCode={code ?? undefined} onEnter={enter} />;
  return <RoomScreen session={session} onLeave={leave} />;
}

function RoomScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { u } = useI18n();
  const noteText = useNoteText();
  const { room, conn, toast, fatal, left, cardTicket, act, start, leave, transferHost, kick, skipTurn, removePlayer, forfeit, addBot, setSpectator,
    replaceWithBot, setTurnTimer, emote, rematch, emotes } = useRoom(session);
  const spectating = !!room?.players.find((p) => p.id === session.playerId)?.spectator;
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Server confirmed we left the lobby seat (or closed the socket on purpose).
  useEffect(() => {
    if (!left) return;
    if (!room || room.status === 'lobby' || spectating) clearSession(session.code);
    onLeave();
  }, [left]);

  // "Play bots" from the landing page: start as soon as the room is ready.
  useEffect(() => {
    if (conn !== 'open' || room?.status !== 'lobby') return;
    let flag: string | null = null;
    try { flag = sessionStorage.getItem('mk2:autostart'); } catch { /* storage blocked */ }
    if (flag !== session.code) return;
    try { sessionStorage.removeItem('mk2:autostart'); } catch { /* ignore */ }
    start();
  }, [conn, room?.status]);

  const requestLeave = () => {
    if (conn !== 'open') { onLeave(); return; }
    if (room?.status === 'lobby' || spectating) leave();
    else setConfirmLeave(true);
  };

  if (fatal) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <p className="mb-4 text-lg">{noteText(fatal)}</p>
          <Button onClick={() => { clearSession(session.code); onLeave(); }}>{u('back_home')}</Button>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 text-teal-900">
        <div className="dice-rolling text-5xl">🎲</div>
        <p>{u(conn === 'reconnecting' ? 'reconnecting' : 'entering_room')}</p>
      </div>
    );
  }
  return (
    <CardTicketContext.Provider value={cardTicket}>
      <Toast toast={toast} />
      {room.status === 'lobby' || !room.game
        ? <Lobby room={room} me={session.playerId} onStart={start} onLeave={requestLeave} onTransferHost={transferHost} onKick={kick}
            onAddBot={addBot} onSetSpectator={setSpectator} onSetTurnTimer={setTurnTimer} />
        : <Board room={room} me={session.playerId} conn={conn} act={act} onSkipTurn={skipTurn} onRemovePlayer={removePlayer}
            onReplaceBot={replaceWithBot} onEmote={emote} onRematch={rematch} emotes={emotes} onLeave={room.status === 'ended' ? onLeave : requestLeave} />}
      <Modal open={confirmLeave} onClose={() => { setConfirmLeave(false); setConfirmForfeit(false); }}>
        {!confirmForfeit ? (
          <>
            <h3 className="mb-2 text-xl font-bold">{u('leave_game_q')}</h3>
            <p className="mb-5 text-slate-600">{u('leave_game_body')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmLeave(false)}>{u('keep_playing')}</Button>
              <Button onClick={onLeave}>{u('leave_temp')}</Button>
            </div>
            <Button variant="ghost" className="mt-2 w-full text-sm text-rose-600" onClick={() => setConfirmForfeit(true)}>
              {u('forfeit_link')}
            </Button>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-xl font-bold">{u('forfeit_q')}</h3>
            <p className="mb-5 text-slate-600">
              {u('forfeit_body')}
              {room.game && room.game.players.length <= 2 && u('forfeit_last')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmForfeit(false)}>{u('go_back')}</Button>
              <Button variant="danger" onClick={() => { forfeit(); setConfirmLeave(false); setConfirmForfeit(false); }}>{u('confirm_forfeit')}</Button>
            </div>
          </>
        )}
      </Modal>
    </CardTicketContext.Provider>
  );
}
