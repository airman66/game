// Прогресс игрока: облако Яндекса + localStorage как запасной вариант.
// Облако — источник истины при первом запуске; дальше пишем в оба.

import { loadCloudData, saveCloudData } from './yandex.js';

const LS_KEY = 'turbo-traffic-3d-save';

const DEFAULTS = {
  best: 0,
  coins: 0,
  ownedCars: ['sedan-sports'],
  selectedCar: 'sedan-sports',
  sound: true,
  music: true,
  vibro: true,
  quality: 'auto', // 'auto' | 'low'
  missions: null,
  missionLevel: 0,
  lastDaily: '',
  dailyStreak: 0,
  konami: false,
  tutorialSeen: false,
  xp: 0,
  achUnlocked: [],
  totals: {
    runs: 0, dist: 0, near: 0, oncoming: 0, rams: 0, cones: 0,
    nitro: 0, coins: 0, bestCombo: 0, maxScore: 0, bestTime: 0, ufo: false,
  },
};

let state = { ...DEFAULTS };
let saveTimer = 0;

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function merge(a, b) {
  if (!b) return a;
  return {
    ...a,
    ...b,
    best: Math.max(a.best || 0, b.best || 0),
    coins: Math.max(a.coins || 0, b.coins || 0),
    xp: Math.max(a.xp || 0, b.xp || 0),
    ownedCars: [...new Set([...(a.ownedCars || []), ...(b.ownedCars || [])])],
    achUnlocked: [...new Set([...(a.achUnlocked || []), ...(b.achUnlocked || [])])],
    totals: mergeTotals(a.totals, b.totals),
  };
}

function mergeTotals(a = {}, b = {}) {
  const out = { ...DEFAULTS.totals };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'boolean') out[k] = !!(a[k] || b[k]);
    else out[k] = Math.max(a[k] || 0, b[k] || 0);
  }
  return out;
}

export async function initSave() {
  state = merge({ ...DEFAULTS }, readLocal());
  const cloud = await loadCloudData();
  if (cloud && Object.keys(cloud).length) {
    state = merge(state, cloud);
  }
  if (!state.ownedCars.includes(state.selectedCar)) {
    state.selectedCar = state.ownedCars[0] || DEFAULTS.selectedCar;
  }
  return state;
}

export function getSave() {
  return state;
}

export function updateSave(patch) {
  Object.assign(state, patch);
  scheduleFlush();
}

function scheduleFlush() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCloudData(state), 800);
}

export function flushSave() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  saveCloudData(state);
}
