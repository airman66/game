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
    ownedCars: [...new Set([...(a.ownedCars || []), ...(b.ownedCars || [])])],
  };
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
