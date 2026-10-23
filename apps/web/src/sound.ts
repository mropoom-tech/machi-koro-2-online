// Sound effects synthesized with the Web Audio API (no audio files to host or license).
// Browsers only allow audio after a user gesture, so the context is created/resumed lazily.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const MUTE_KEY = 'mk2:muted';
const VOLUME_KEY = 'mk2:volume';
const DEFAULT_VOLUME = 0.5;

/** Master volume 0..1 (remembered per browser). */
export function getVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
export function setVolume(v: number) {
  const vol = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(VOLUME_KEY, String(vol)); } catch { /* ignore */ }
  if (master) master.gain.value = vol;
}

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    master!.gain.value = getVolume();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Everything goes through the master gain so the volume setting applies to all sounds. */
const out = () => master!;

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
  src.connect(bp).connect(g).connect(out());
  src.start(at);
}

/** Dice rattling in a cup and landing on the table (~0.9 s, matches the roll animation). */
export function playDiceRoll(dice = 2) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < 9; i++) clack(ac, t + i * 0.075 + Math.random() * 0.02, 0.2);
  for (let d = 0; d < dice; d++) clack(ac, t + 0.78 + d * 0.06, 0.5); // landing
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, gain = 0.22) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(out());
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

/** Wooden hammer knock: low thump plus a short noise click. */
function knock(ac: AudioContext, at: number, gain: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, at);
  o.frequency.exponentialRampToValueAtTime(90, at + 0.12);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  o.connect(g).connect(out());
  o.start(at);
  o.stop(at + 0.2);
  clack(ac, at, gain * 0.5);
}

/** Building an establishment: two hammer knocks. */
export function playBuild() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  knock(ac, t, 0.45);
  knock(ac, t + 0.14, 0.35);
}

/** Building a landmark: hammer knocks, then a rising fanfare. */
export function playLandmark() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  knock(ac, t, 0.45);
  knock(ac, t + 0.14, 0.35);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, f, t + 0.32 + i * 0.1, 0.45, 0.18)); // C E G C
}

/** You won: triumphant fanfare (arpeggio, then a held chord). */
export function playVictory() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => tone(ac, f, t + i * 0.13, 0.3, 0.2));
  tone(ac, 783.99, t + 0.6, 0.25, 0.18);
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(ac, f, t + 0.85, 1.6, 0.14)); // final chord
}

/** Someone else won: short, gentle descending "game over" phrase. */
export function playGameOver() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [783.99, 659.25, 523.25].forEach((f, i) => tone(ac, f, t + i * 0.18, 0.5, 0.14)); // G E C
}
