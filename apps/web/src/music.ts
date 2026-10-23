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

const MIX = 0.35; // overall music level before the user volume
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export type TrackName = 'game' | 'lobby';
interface Track {
  bpm: number;
  /** one chord per bar: [bass root, chord tones for the arpeggio] */
  bars: [number, number[]][];
  /** one entry per beat (null = rest) */
  melody: (number | null)[][];
  /** game: bass on beats 1 and 3 plus a fifth; lobby: one long note per bar */
  busyBass: boolean;
  arp: { type: OscillatorType; gain: number };
  lead: { type: OscillatorType; gain: number; beats: number };
}

const TRACKS: Record<TrackName, Track> = {
  // Upbeat, while playing: C–Am–F–G–C–Am–Dm–G
  game: {
    bpm: 96,
    bars: [
      [48, [60, 64, 67]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [59, 62, 67]],
      [48, [60, 64, 67]], [45, [57, 60, 64]], [50, [57, 62, 65]], [43, [59, 62, 67]],
    ],
    melody: [
      [76, 79, 81, 79], [76, 72, 74, 76], [81, 79, 77, 76], [74, null, 67, null],
      [76, 79, 84, 83], [81, 79, 76, null], [77, 76, 74, 69], [71, 74, 79, null],
    ],
    busyBass: true,
    arp: { type: 'triangle', gain: 0.16 },
    lead: { type: 'sine', gain: 0.3, beats: 0.9 },
  },
  // Relaxed, while waiting in the lobby: F–Em–Dm–C–F–Em–Dm–G, slower and sparser
  lobby: {
    bpm: 76,
    bars: [
      [41, [60, 65, 69]], [40, [59, 64, 67]], [38, [57, 62, 65]], [36, [55, 60, 64]],
      [41, [60, 65, 69]], [40, [59, 64, 67]], [38, [57, 62, 65]], [43, [59, 62, 67]],
    ],
    melody: [
      [72, null, 69, null], [71, null, 67, null], [69, null, 65, null], [67, null, null, null],
      [72, null, 76, null], [74, null, 71, null], [72, null, 69, null], [71, null, 74, null],
    ],
    busyBass: false,
    arp: { type: 'sine', gain: 0.14 },
    lead: { type: 'triangle', gain: 0.22, beats: 1.8 },
  },
};

// ------------------------------------------------------------------ playback

let ctxRef: AudioContext | null = null;
let bus: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;
let wanted: TrackName | null = null; // the screen that wants music (independent of the on/off setting)
let track: Track = TRACKS.game;
let playing: TrackName | null = null;
const stepLen = () => 60 / track.bpm / 4; // 16th note

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
  const STEP = stepLen();
  const bar = Math.floor(s / 16) % track.bars.length;
  const pos = s % 16;
  const [root, chord] = track.bars[bar];
  if (track.busyBass) {
    if (pos === 0 || pos === 8) note(midi(root), at, STEP * 7, 'triangle', 0.5);
    if (pos === 12) note(midi(root + 7), at, STEP * 3.5, 'triangle', 0.35);
  } else if (pos === 0) {
    note(midi(root), at, STEP * 15, 'sine', 0.45);
  }
  if (pos % 2 === 0) {
    const tone = chord[(pos / 2) % chord.length] + (pos >= 8 ? 12 : 0);
    note(midi(tone), at, STEP * 1.8, track.arp.type, track.arp.gain);
  }
  if (pos % 4 === 0) {
    const m = track.melody[bar][pos / 4];
    if (m !== null) note(midi(m), at, STEP * 4 * track.lead.beats, track.lead.type, track.lead.gain);
  }
}

function tick() {
  const ac = ctxRef!;
  if (ac.state !== 'running') return; // wait for the first user gesture
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.25) {
    scheduleStep(step, nextTime);
    step = (step + 1) % (track.bars.length * 16);
    nextTime += stepLen();
  }
}

function start() {
  if (timer || !isMusicOn() || !wanted) return;
  track = TRACKS[wanted];
  playing = wanted;
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
  playing = null;
  const b = bus;
  bus = null;
  if (b && ctxRef) {
    b.gain.setTargetAtTime(0, ctxRef.currentTime, fadeSeconds / 3);
    setTimeout(() => b.disconnect(), fadeSeconds * 1000 + 200);
  }
}

/** A screen calls this on mount. Switching track (lobby → game) cross-fades to the new one. */
export function startMusic(name: TrackName = 'game') {
  wanted = name;
  if (playing && playing !== name) stop(0.8);
  start();
}
/** Called when leaving the screen or when the game ends. */
export function stopMusic(fadeSeconds = 0.4, name?: TrackName) {
  if (name && wanted !== name) return; // another screen already took over
  wanted = null;
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
