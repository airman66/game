// Весь звук — процедурный WebAudio: ноль аудиофайлов в билде.
// Требование Яндекс Игр: звук глушится при сворачивании вкладки и во время рекламы.

let ctx = null;
let master = null;
let musicGain = null;
let engineNodes = null;
let enabled = true;
let adPaused = false;
let musicTimer = 0;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.16;
  musicGain.connect(master);
  return ctx;
}

// Разблокировка аудио по первому жесту пользователя (политика браузеров).
export function unlockAudio() {
  ensureCtx();
  if (ctx && ctx.state === 'suspended' && !adPaused && !document.hidden) ctx.resume();
}

export function setSoundEnabled(on) {
  enabled = on;
  if (!ctx) return;
  master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.02);
}

export function isSoundEnabled() {
  return enabled;
}

// Полная пауза (сворачивание вкладки, показ рекламы).
export function suspendAudio() {
  adPaused = true;
  ctx?.suspend();
}

export function resumeAudio() {
  adPaused = false;
  if (ctx && !document.hidden) ctx.resume();
}

function blip({ freq = 440, endFreq, dur = 0.15, type = 'sine', vol = 0.5, when = 0 }) {
  if (!ensureCtx() || !enabled) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.6, filterFreq = 1000, filterEnd = 120 }) {
  if (!ensureCtx() || !enabled) return;
  const t0 = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, t0);
  filter.frequency.exponentialRampToValueAtTime(filterEnd, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  click() { blip({ freq: 660, endFreq: 520, dur: 0.07, type: 'square', vol: 0.15 }); },
  coin() {
    blip({ freq: 1180, dur: 0.06, type: 'triangle', vol: 0.3 });
    blip({ freq: 1568, dur: 0.14, type: 'triangle', vol: 0.3, when: 0.05 });
  },
  nearMiss() { noise({ dur: 0.22, vol: 0.35, filterFreq: 2600, filterEnd: 500 }); },
  powerup() {
    blip({ freq: 520, endFreq: 1040, dur: 0.18, type: 'sawtooth', vol: 0.2 });
    blip({ freq: 780, endFreq: 1560, dur: 0.2, type: 'triangle', vol: 0.25, when: 0.08 });
  },
  shieldPop() { blip({ freq: 900, endFreq: 180, dur: 0.28, type: 'square', vol: 0.3 }); },
  crash() {
    noise({ dur: 0.55, vol: 0.9, filterFreq: 900, filterEnd: 60 });
    blip({ freq: 140, endFreq: 40, dur: 0.5, type: 'sawtooth', vol: 0.55 });
  },
  revive() { blip({ freq: 392, endFreq: 784, dur: 0.35, type: 'triangle', vol: 0.35 }); },
  record() {
    [523, 659, 784, 1047].forEach((f, i) => blip({ freq: f, dur: 0.16, type: 'triangle', vol: 0.3, when: i * 0.09 }));
  },
};

// --- Двигатель: пила через фильтр, частота растёт со скоростью ---

export function startEngine() {
  if (!ensureCtx() || engineNodes) return;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc2.type = 'square';
  osc.frequency.value = 55;
  osc2.frequency.value = 55.7;
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  g.gain.value = 0.0;
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(g).connect(master);
  osc.start();
  osc2.start();
  g.gain.setTargetAtTime(0.055, ctx.currentTime, 0.4);
  engineNodes = { osc, osc2, g, filter };
}

export function setEngineSpeed(t) { // t: 0..1
  if (!engineNodes || !ctx) return;
  const f = 50 + t * 110;
  engineNodes.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
  engineNodes.osc2.frequency.setTargetAtTime(f * 1.012, ctx.currentTime, 0.1);
  engineNodes.filter.frequency.setTargetAtTime(220 + t * 900, ctx.currentTime, 0.1);
}

export function stopEngine() {
  if (!engineNodes || !ctx) return;
  const { osc, osc2, g } = engineNodes;
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  setTimeout(() => { try { osc.stop(); osc2.stop(); } catch (e) { /* noop */ } }, 500);
  engineNodes = null;
}

// --- Фоновая музыка: неторопливый синт-пад из двух аккордов ---

const CHORDS = [
  [110, 164.81, 220, 277.18],  // A + C#
  [87.31, 130.81, 174.61, 220], // F + A
  [98, 146.83, 196, 246.94],    // G + B
  [110, 164.81, 220, 261.63],   // Am + C
];
let chordIdx = 0;

function playChord() {
  if (!ctx || !enabled) return;
  const notes = CHORDS[chordIdx % CHORDS.length];
  chordIdx++;
  const t0 = ctx.currentTime;
  const dur = 3.4;
  for (const f of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

export function startMusic() {
  if (!ensureCtx() || musicTimer) return;
  playChord();
  musicTimer = setInterval(playChord, 3200);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = 0;
}
