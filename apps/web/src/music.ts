// Cheerful background music, synthesized live with Web Audio (no audio files to host or license).
// An 8-bar loop in C major (C–Am–F–G–C–Am–Dm–G): soft bass, plucked arpeggio and a gentle melody.
// A small look-ahead scheduler queues notes slightly in advance so timing stays steady.
import { audioContext } from './sound';

const ON_KEY = 'mk2:music';
const VOL_KEY = 'mk2:musicVolume';
const DEFAULT_VOLUME = 0.3;

export function isMusicOn(): boolean {
  try { return localStorage.getItem(ON_KEY) !== '0'; } catch { return true; }
}
export function getMusicVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
export function setMusicVolume(v: number) {
  const vol = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(VOL_KEY, String(vol)); } catch { /* ignore */ }
  if (bus && ctxRef) bus.gain.setTargetAtTime(vol * MIX, ctxRef.currentTime, 0.05);
}
export function setMusicOn(on: boolean) {
  try { localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  if (on && wanted) start(); else if (!on) stop();
}

// ------------------------------------------------------------------ composition

const BPM = 96;
const STEP = 60 / BPM / 4; // 16th note
const MIX = 0.35; // overall music level before the user volume
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// One chord per bar: [bass root, chord tones for the arpeggio]
const BARS: [number, number[]][] = [
  [48, [60, 64, 67]], // C
  [45, [57, 60, 64]], // Am
  [41, [57, 60, 65]], // F
  [43, [59, 62, 67]], // G
  [48, [60, 64, 67]], // C
  [45, [57, 60, 64]], // Am
  [50, [57, 62, 65]], // Dm
  [43, [59, 62, 67]], // G
];
// Melody: one quarter note per beat (null = rest)
const MELODY: (number | null)[][] = [
  [76, 79, 81, 79], [76, 72, 74, 76], [81, 79, 77, 76], [74, null, 67, null],
  [76, 79, 84, 83], [81, 79, 76, null], [77, 76, 74, 69], [71, 74, 79, null],
];

// ------------------------------------------------------------------ playback

let ctxRef: AudioContext | null = null;
let bus: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;
let wanted = false; // the game screen wants music (independent of the on/off setting)

function note(freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
  const ac = ctxRef!;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
  o.connect(g).connect(bus!);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function scheduleStep(s: number, at: number) {
  const bar = Math.floor(s / 16) % BARS.length;
  const pos = s % 16;
  const [root, chord] = BARS[bar];
  if (pos === 0 || pos === 8) note(midi(root), at, STEP * 7, 'triangle', 0.5);
  if (pos === 12) note(midi(root + 7), at, STEP * 3.5, 'triangle', 0.35);
  if (pos % 2 === 0) {
    const tone = chord[(pos / 2) % chord.length] + (pos >= 8 ? 12 : 0);
    note(midi(tone), at, STEP * 1.8, 'triangle', 0.16);
  }
  if (pos % 4 === 0) {
    const m = MELODY[bar][pos / 4];
    if (m !== null) note(midi(m), at, STEP * 3.6, 'sine', 0.3);
  }
}

function tick() {
  const ac = ctxRef!;
  if (ac.state !== 'running') return; // wait for the first user gesture
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.25) {
    scheduleStep(step, nextTime);
    step = (step + 1) % (BARS.length * 16);
    nextTime += STEP;
  }
}

function start() {
  if (timer || !isMusicOn()) return;
  const ac = audioContext();
  if (!ac) return;
  ctxRef = ac;
  bus = ac.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(getMusicVolume() * MIX, ac.currentTime, 0.6); // fade in
  bus.connect(ac.destination);
  step = 0;
  nextTime = 0;
  timer = setInterval(tick, 60);
}

function stop(fadeSeconds = 0.4) {
  if (timer) clearInterval(timer);
  timer = null;
  const b = bus;
  bus = null;
  if (b && ctxRef) {
    b.gain.setTargetAtTime(0, ctxRef.currentTime, fadeSeconds / 3);
    setTimeout(() => b.disconnect(), fadeSeconds * 1000 + 200);
  }
}

/** The game screen calls this on mount; music plays when the setting is on. */
export function startMusic() {
  wanted = true;
  start();
}
/** Called when leaving the game or when it ends. */
export function stopMusic(fadeSeconds = 0.4) {
  wanted = false;
  stop(fadeSeconds);
}

// Pause while the tab is hidden (background timers are throttled and would stutter).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!wanted) return;
    if (document.hidden) stop(0.2);
    else start();
  });
}
