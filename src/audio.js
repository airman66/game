// Звук: музыка и удары — CC0-файлы (Juhani Junkala, cynicmusic, Kenney),
// остальные эффекты — процедурный WebAudio. Файлы грузятся лениво после старта,
// пока их нет — работают синтезированные версии.
// Требование Яндекс Игр: звук глушится при сворачивании вкладки и во время рекламы.

let ctx = null;
let master = null;      // все звуки
let sfxGain = null;     // эффекты
let musicGain = null;   // музыка
let engineNodes = null;
let soundOn = true;
let musicOn = true;
let adPaused = false;

const MUSIC_VOL = 0.42;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.5;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = MUSIC_VOL;
  musicGain.connect(master);
  return ctx;
}

export function unlockAudio() {
  ensureCtx();
  if (ctx && ctx.state === 'suspended' && !adPaused && !document.hidden) ctx.resume();
}

export function setSoundEnabled(on) {
  soundOn = on;
  if (ctx) sfxGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.02);
}
export function isSoundEnabled() { return soundOn; }

export function setMusicEnabled(on) {
  musicOn = on;
  if (ctx) musicGain.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
}
export function isMusicEnabled() { return musicOn; }

export function suspendAudio() {
  adPaused = true;
  ctx?.suspend();
}

export function resumeAudio() {
  adPaused = false;
  if (ctx && !document.hidden) ctx.resume();
}

// ---------- Музыка из файлов ----------

const musicBuffers = new Map(); // name -> AudioBuffer
let musicSource = null;
let currentTrack = null;
let wantedTrack = null;

const TRACKS = {
  menu: 'assets/audio/music-menu.mp3',
  race1: 'assets/audio/music-race1.mp3',
  race2: 'assets/audio/music-race2.mp3',
  rampage: 'assets/audio/music-rampage.mp3',
};

const SFX_FILES = {
  crashMetal: 'assets/audio/sfx-crash-metal.ogg',
  crashGlass: 'assets/audio/sfx-crash-glass.ogg',
  ram: 'assets/audio/sfx-ram.ogg',
  cone: 'assets/audio/sfx-cone.ogg',
};
const sfxBuffers = new Map();

// Ленивая фоновая загрузка: вызывается после LoadingAPI.ready, старт не тормозит.
export async function preloadAudioFiles() {
  if (!ensureCtx()) return;
  const load = async (url) => {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  };
  await Promise.allSettled([
    ...Object.entries(SFX_FILES).map(async ([k, url]) => {
      sfxBuffers.set(k, await load(url));
    }),
    ...Object.entries(TRACKS).map(async ([k, url]) => {
      musicBuffers.set(k, await load(url));
      if (wantedTrack === k && currentTrack !== k) playMusic(k);
    }),
  ]);
}

export function playMusic(name) {
  wantedTrack = name;
  if (!ensureCtx()) return;
  const buf = musicBuffers.get(name);
  if (!buf) return; // догрузится — заиграет (см. preloadAudioFiles)
  if (currentTrack === name && musicSource) return;
  stopMusicSource();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(0.0001, ctx.currentTime);
  fade.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
  src.connect(fade).connect(musicGain);
  src.start();
  musicSource = { src, fade };
  currentTrack = name;
}

function stopMusicSource() {
  if (!musicSource) return;
  const { src, fade } = musicSource;
  try {
    fade.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => { try { src.stop(); } catch (e) { /* noop */ } }, 600);
  } catch (e) { /* noop */ }
  musicSource = null;
  currentTrack = null;
}

export function stopMusic() {
  wantedTrack = null;
  stopMusicSource();
}

function playBuffer(name, { vol = 0.8, rate = 1 } = {}) {
  const buf = sfxBuffers.get(name);
  if (!buf || !ctx || !soundOn) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(sfxGain);
  src.start();
  return true;
}

// ---------- Процедурные эффекты ----------

function blip({ freq = 440, endFreq, dur = 0.15, type = 'sine', vol = 0.5, when = 0 }) {
  if (!ensureCtx() || !soundOn) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.6, filterFreq = 1000, filterEnd = 120 }) {
  if (!ensureCtx() || !soundOn) return;
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
  src.connect(filter).connect(g).connect(sfxGain);
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
    const metal = playBuffer('crashMetal', { vol: 0.95 });
    playBuffer('crashGlass', { vol: 0.7, rate: 0.95 });
    if (!metal) {
      noise({ dur: 0.55, vol: 0.9, filterFreq: 900, filterEnd: 60 });
      blip({ freq: 140, endFreq: 40, dur: 0.5, type: 'sawtooth', vol: 0.55 });
    }
  },
  ram() {
    if (!playBuffer('ram', { vol: 0.85, rate: 1 + Math.random() * 0.15 })) {
      noise({ dur: 0.3, vol: 0.55, filterFreq: 1400, filterEnd: 200 });
    }
    blip({ freq: 220, endFreq: 70, dur: 0.25, type: 'square', vol: 0.3 });
  },
  cone() {
    if (!playBuffer('cone', { vol: 0.7, rate: 1.1 + Math.random() * 0.2 })) {
      blip({ freq: 300, endFreq: 120, dur: 0.12, type: 'square', vol: 0.2 });
    }
  },
  revive() { blip({ freq: 392, endFreq: 784, dur: 0.35, type: 'triangle', vol: 0.35 }); },
  record() {
    [523, 659, 784, 1047].forEach((f, i) => blip({ freq: f, dur: 0.16, type: 'triangle', vol: 0.3, when: i * 0.09 }));
  },
  horn() {
    blip({ freq: 392, dur: 0.16, type: 'square', vol: 0.18 });
    blip({ freq: 494, dur: 0.16, type: 'square', vol: 0.18 });
    blip({ freq: 392, dur: 0.22, type: 'square', vol: 0.16, when: 0.2 });
    blip({ freq: 494, dur: 0.22, type: 'square', vol: 0.16, when: 0.2 });
  },
  hornReply() {
    blip({ freq: 330, dur: 0.12, type: 'square', vol: 0.12, when: 0 });
    blip({ freq: 330, dur: 0.3, type: 'square', vol: 0.12, when: 0.16 });
  },
  nitro() {
    noise({ dur: 0.5, vol: 0.45, filterFreq: 400, filterEnd: 3200 });
    blip({ freq: 120, endFreq: 620, dur: 0.55, type: 'sawtooth', vol: 0.3 });
  },
  missionDone() {
    [659, 784, 988, 1319].forEach((f, i) => blip({ freq: f, dur: 0.18, type: 'triangle', vol: 0.32, when: i * 0.11 }));
  },
  daily() {
    [880, 1109, 1319].forEach((f, i) => blip({ freq: f, dur: 0.12, type: 'triangle', vol: 0.3, when: i * 0.08 }));
  },
  ufo() {
    blip({ freq: 1200, endFreq: 600, dur: 0.3, type: 'sine', vol: 0.15 });
    blip({ freq: 600, endFreq: 1200, dur: 0.3, type: 'sine', vol: 0.15, when: 0.3 });
    blip({ freq: 1200, endFreq: 600, dur: 0.3, type: 'sine', vol: 0.12, when: 0.6 });
  },
};

// ---------- Двигатель ----------

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
  filter.connect(g).connect(sfxGain);
  osc.start();
  osc2.start();
  g.gain.setTargetAtTime(0.055, ctx.currentTime, 0.4);
  engineNodes = { osc, osc2, g, filter };
}

export function setEngineSpeed(t) { // t: 0..1 (+ nitro поверх единицы)
  if (!engineNodes || !ctx) return;
  const f = 50 + t * 120;
  engineNodes.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
  engineNodes.osc2.frequency.setTargetAtTime(f * 1.012, ctx.currentTime, 0.1);
  engineNodes.filter.frequency.setTargetAtTime(220 + t * 1000, ctx.currentTime, 0.1);
}

export function stopEngine() {
  if (!engineNodes || !ctx) return;
  const { osc, osc2, g } = engineNodes;
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  setTimeout(() => { try { osc.stop(); osc2.stop(); } catch (e) { /* noop */ } }, 500);
  engineNodes = null;
}

// ---------- Сирены спецтранспорта (одна одновременно, с эффектом Доплера) ----------

let sirenActive = false;

export function createSiren(kind) { // 'police' | 'wail'
  if (!ensureCtx() || sirenActive) return null;
  sirenActive = true;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = kind === 'police' ? 'square' : 'sawtooth';
  osc.frequency.value = 700;
  g.gain.value = 0;
  osc.connect(g).connect(sfxGain);
  osc.start();
  let t = 0;
  let stopped = false;
  return {
    update(dt, dist, doppler = 1) {
      if (stopped) return;
      t += dt;
      const base = kind === 'police'
        ? (Math.floor(t / 0.42) % 2 ? 660 : 880)
        : 620 + 260 * Math.abs(Math.sin(t * 2.2));
      osc.frequency.value = base * doppler;
      const vol = Math.max(0, 0.11 * (1 - dist / 130));
      g.gain.setTargetAtTime(soundOn ? vol : 0, ctx.currentTime, 0.08);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      sirenActive = false;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => { try { osc.stop(); } catch (e) { /* noop */ } }, 400);
    },
  };
}
