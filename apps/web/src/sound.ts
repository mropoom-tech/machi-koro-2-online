// Sound effects synthesized with the Web Audio API (no audio files to host or license).
// Browsers only allow audio after a user gesture, so the context is created/resumed lazily.

let ctx: AudioContext | null = null;
const MUTE_KEY = 'mk2:muted';

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

// Unlock audio on the first interaction so later, non-click sounds (opponents' rolls) can play.
if (typeof window !== 'undefined') {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** A short wooden "clack": filtered noise burst. */
function clack(ac: AudioContext, at: number, gain: number) {
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800 + Math.random() * 1600;
  bp.Q.value = 2.5;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
}

/** Dice rattling in a cup and landing on the table (~0.9 s, matches the roll animation). */
export function playDiceRoll(dice = 2) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < 9; i++) clack(ac, t + i * 0.075 + Math.random() * 0.02, 0.35);
  for (let d = 0; d < dice; d++) clack(ac, t + 0.78 + d * 0.06, 0.9); // landing
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, gain = 0.22) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Bright two-note chime: "it's your turn". */
export function playYourTurn() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 659.25, t, 0.35);       // E5
  tone(ac, 987.77, t + 0.13, 0.5); // B5
}

/** Soft coin sound for income. */
export function playCoin() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 1318.5, t, 0.12, 0.12);
  tone(ac, 1760, t + 0.06, 0.2, 0.12);
}
