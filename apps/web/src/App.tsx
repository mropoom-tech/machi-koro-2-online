import { useEffect, useState } from 'react';
import { normalizeCode } from '@mk2/game-engine';
import { Landing } from './components/Landing';
import { Lobby } from './components/Lobby';
import { Board } from './components/Board';
import { Button, Modal, Toast } from './components/ui';
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
  const { room, conn, toast, fatal, left, act, start, leave, transferHost, kick, skipTurn, removePlayer, forfeit } = useRoom(session);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Server confirmed we left the lobby seat (or closed the socket on purpose).
  useEffect(() => {
    if (!left) return;
    if (!room || room.status === 'lobby') clearSession(session.code);
    onLeave();
  }, [left]);

  const requestLeave = () => {
    if (conn !== 'open') { onLeave(); return; }
    if (room?.status === 'lobby') leave();
    else setConfirmLeave(true);
  };

  if (fatal) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <p className="mb-4 text-lg">{fatal}</p>
          <Button onClick={() => { clearSession(session.code); onLeave(); }}>กลับหน้าแรก</Button>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 text-teal-900">
        <div className="dice-rolling text-5xl">🎲</div>
        <p>{conn === 'reconnecting' ? 'กำลังเชื่อมต่อใหม่…' : 'กำลังเข้าห้อง…'}</p>
      </div>
    );
  }
  return (
    <>
      <Toast toast={toast} />
      {room.status === 'lobby' || !room.game
        ? <Lobby room={room} me={session.playerId} onStart={start} onLeave={requestLeave} onTransferHost={transferHost} onKick={kick} />
        : <Board room={room} me={session.playerId} conn={conn} act={act} onSkipTurn={skipTurn} onRemovePlayer={removePlayer} onLeave={room.status === 'ended' ? onLeave : requestLeave} />}
      <Modal open={confirmLeave} onClose={() => { setConfirmLeave(false); setConfirmForfeit(false); }}>
        {!confirmForfeit ? (
          <>
            <h3 className="mb-2 text-xl font-bold">ออกจากเกม?</h3>
            <p className="mb-5 text-slate-600">
              ออกชั่วคราว: ที่นั่งยังอยู่ กลับมาเล่นต่อได้ด้วยลิงก์ห้องเดิมบนอุปกรณ์นี้
              (ถ้าไม่กลับมา เทิร์นของคุณจะถูกข้าม และถูกนำออกเมื่อข้ามครบ 3 เทิร์น)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmLeave(false)}>เล่นต่อ</Button>
              <Button onClick={onLeave}>ออกชั่วคราว</Button>
            </div>
            <Button variant="ghost" className="mt-2 w-full text-sm text-rose-600" onClick={() => setConfirmForfeit(true)}>
              🏳️ ยอมแพ้และออกจากเกมถาวร
            </Button>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-xl font-bold">ยอมแพ้?</h3>
            <p className="mb-5 text-slate-600">
              การ์ดทั้งหมดของคุณจะออกจากเกม เหรียญคืนธนาคาร และกลับเข้าเกมนี้ไม่ได้อีก
              {room.game && room.game.players.length <= 2 && ' — เหลือผู้เล่นอีกคนเดียว เขาจะชนะทันที'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmForfeit(false)}>ย้อนกลับ</Button>
              <Button variant="danger" onClick={() => { forfeit(); setConfirmLeave(false); setConfirmForfeit(false); }}>ยืนยันยอมแพ้</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
