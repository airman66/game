// Экраны, HUD, гараж, задания, рекорды, настройки. Разметка — в index.html.

import * as THREE from 'three';
import { spawnModel, CAR_IDS } from './assets.js';
import { t, carName, crashPhrase, buyJoke, missionText } from './i18n.js';
import { getSave, updateSave, flushSave } from './save.js';
import { sfx } from './audio.js';
import { getMissions } from './missions.js';

export const CAR_PRICES = {
  'sedan-sports': 0, 'hatchback-sports': 300, suv: 600, taxi: 1000, van: 1500,
  police: 2200, 'suv-luxury': 3000, ambulance: 4000, race: 5500,
  firetruck: 7500, 'garbage-truck': 10000, 'race-future': 15000,
};

const $ = (id) => document.getElementById(id);

const screens = [
  'screen-loading', 'screen-menu', 'screen-garage', 'hud', 'screen-pause',
  'screen-gameover', 'screen-missions', 'screen-leaderboard', 'screen-settings',
];

export function showScreens(...names) {
  for (const s of screens) {
    $(s).classList.toggle('visible', names.includes(s));
  }
}

export function setLoadingProgress(p) {
  $('loading-bar').style.width = `${Math.round(p * 100)}%`;
  $('loading-text').textContent = `${Math.round(p * 100)}%`;
}

// ---------- HUD ----------

let toastTimer = 0;

export const hud = {
  setScore(score) { $('hud-score').textContent = score; },
  setCoins(c) { $('hud-coins').textContent = c; },
  setSpeed(unitsPerSec) { $('hud-speed').textContent = Math.round(unitsPerSec * 3.6); },
  setTimer(sec, on) {
    const el = $('hud-timer');
    el.classList.toggle('on', on);
    if (on) {
      el.textContent = Math.ceil(sec);
      el.classList.toggle('urgent', sec <= 5.5);
    }
  },
  toast(key, pts, combo) {
    const el = $('hud-toast');
    let text = t(key);
    if (combo && combo > 1) text += ` x${combo}`;
    if (pts) text += ` +${pts}`;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 950);
  },
  setPowerups({ magnet, x2, shield }) {
    const bar = $('powerup-bar');
    const parts = [];
    if (magnet > 0) parts.push(`<div class="powerup-pill">🧲 <span class="pp-time">${Math.ceil(magnet)}</span></div>`);
    if (shield) parts.push(`<div class="powerup-pill">🛡</div>`);
    if (x2 > 0) parts.push(`<div class="powerup-pill">✖2 <span class="pp-time">${Math.ceil(x2)}</span></div>`);
    const html = parts.join('');
    if (bar._last !== html) { bar.innerHTML = html; bar._last = html; }
    $('hud-mult').classList.toggle('on', x2 > 0);
  },
  setNitro(value, active) {
    const btn = $('btn-nitro');
    const ready = value >= 100;
    btn.classList.toggle('ready', ready && !active);
    btn.classList.toggle('active', active);
    const deg = Math.round(value * 3.6);
    btn.style.background = active
      ? 'radial-gradient(circle, rgba(53,224,255,0.4), rgba(10,14,34,0.7))'
      : `conic-gradient(rgba(255,176,32,0.85) ${deg}deg, rgba(10,14,34,0.65) ${deg}deg)`;
    $('vignette').classList.toggle('on', active);
  },
  setMobileButtons(isMobile) {
    // Нитро-кнопка — это ещё и индикатор шкалы, видна всегда
    $('btn-nitro').classList.add('on');
    $('btn-horn').classList.toggle('on', isMobile);
  },
};

// ---------- Меню ----------

let menuToastTimer = 0;

export function refreshMenu() {
  const save = getSave();
  $('menu-best-value').textContent = save.best;
  $('menu-coins-value').textContent = save.coins;
}

export function menuToast(text) {
  const el = $('menu-toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(menuToastTimer);
  menuToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function setMenuHint(isMobileDevice) {
  $('menu-hint').textContent = isMobileDevice ? t('hintMobile') : t('hintDesktop');
}

// ---------- Гараж ----------

let previewRenderer = null;

function renderCarPreview(id, targetCanvas) {
  if (!previewRenderer) {
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    previewRenderer.setSize(220, 156);
    previewRenderer.setPixelRatio(1);
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 220 / 156, 0.1, 50);
  cam.position.set(3.2, 2.1, 3.6);
  cam.lookAt(0, 0.42, 0);
  scene.add(new THREE.HemisphereLight(0xdde4ff, 0x554433, 1.15));
  const dl = new THREE.DirectionalLight(0xffe0b0, 2.2);
  dl.position.set(4, 6, 3);
  scene.add(dl);
  const car = spawnModel(id, 2.3);
  car.rotation.y = Math.PI * 0.82;
  scene.add(car);
  previewRenderer.render(scene, cam);
  const g2d = targetCanvas.getContext('2d');
  g2d.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  g2d.drawImage(previewRenderer.domElement, 0, 0, targetCanvas.width, targetCanvas.height);
}

export function buildGarage(onSelect) {
  const grid = $('garage-grid');
  grid.innerHTML = '';
  const save = getSave();
  $('garage-coins-value').textContent = save.coins;

  for (const id of CAR_IDS) {
    const owned = save.ownedCars.includes(id);
    const selected = save.selectedCar === id;
    const price = CAR_PRICES[id] ?? 999999;

    const card = document.createElement('div');
    card.className = 'car-card' + (selected ? ' selected' : '');
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 156;
    card.append(cv);

    const name = document.createElement('div');
    name.className = 'car-name';
    name.textContent = carName(id);
    card.append(name);

    const priceEl = document.createElement('div');
    if (selected) {
      priceEl.className = 'car-price selected-label';
      priceEl.textContent = '✓ ' + t('selected');
    } else if (owned) {
      priceEl.className = 'car-price owned';
      priceEl.textContent = t('select');
    } else {
      priceEl.className = 'car-price';
      priceEl.innerHTML = `<span class="coin-icon"></span>${price}`;
    }
    card.append(priceEl);

    card.addEventListener('click', () => {
      const s = getSave();
      if (s.ownedCars.includes(id)) {
        updateSave({ selectedCar: id });
        sfx.click();
        onSelect(id);
        buildGarage(onSelect);
      } else if (s.coins >= price) {
        updateSave({
          coins: s.coins - price,
          ownedCars: [...s.ownedCars, id],
          selectedCar: id,
        });
        flushSave();
        sfx.powerup();
        const joke = buyJoke(id);
        if (joke) menuToast(joke);
        onSelect(id);
        buildGarage(onSelect);
      } else {
        sfx.shieldPop();
        card.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
          { duration: 220 }
        );
      }
    });

    grid.append(card);
    renderCarPreview(id, cv);
  }
}

// ---------- Задания ----------

const MISSION_ICONS = {
  coins_run: '🪙', dist_run: '🛣', near_run: '⚡', overtake_run: '🚗',
  cones_total: '🚧', nitro_total: '🔥', ram_total: '💥', time_run: '⏱',
};

export function buildMissions() {
  const list = $('missions-list');
  list.innerHTML = '';
  for (const m of getMissions()) {
    const card = document.createElement('div');
    card.className = 'mission-card';
    const pct = Math.min(100, Math.round((m.progress / m.goal) * 100));
    card.innerHTML = `
      <div class="mission-text">
        <span>${MISSION_ICONS[m.type] ?? '🎯'} ${missionText(m.type, m.goal)}</span>
        <span class="mission-reward">+${m.reward}</span>
      </div>
      <div class="mission-track"><div class="mission-fill" style="width:${pct}%"></div></div>
      <div class="mission-progress">${Math.floor(m.progress)} / ${m.goal}</div>
    `;
    list.append(card);
  }
}

// ---------- Рекорды ----------

export function buildLeaderboard(entries) {
  const list = $('lb-list');
  list.innerHTML = '';
  if (!entries) {
    list.innerHTML = `<div class="lb-empty">${t('lbUnavailable')}</div>`;
    return;
  }
  if (!entries.length) {
    list.innerHTML = `<div class="lb-empty">${t('lbEmpty')}</div>`;
    return;
  }
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'lb-row' + (e.isUser ? ' me' : '') + (e.rank <= 3 ? ` top${e.rank}` : '');
    const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank;
    row.innerHTML = `
      <span class="lb-rank">${medal}</span>
      <span class="lb-name">${escapeHtml(e.isUser ? t('you') : (e.name || 'Player'))}</span>
      <span class="lb-score">${e.score}</span>
    `;
    list.append(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Настройки ----------

export function refreshSettings() {
  const s = getSave();
  $('tgl-sound').classList.toggle('on', !!s.sound);
  $('tgl-music').classList.toggle('on', !!s.music);
  $('tgl-vibro').classList.toggle('on', !!s.vibro);
  $('tgl-quality').textContent = s.quality === 'low' ? t('qLow') : t('qAuto');
}

// ---------- Игра окончена ----------

export function showGameOver({ score, coins, best, isRecord, canRevive, canDouble, reason }) {
  $('go-title').textContent = t(reason === 'time' ? 'timeUp' : 'crash');
  $('go-phrase').textContent = reason === 'time' ? '' : crashPhrase();
  $('go-score').textContent = score;
  $('go-best').textContent = best;
  $('go-coins').textContent = coins;
  $('go-newrecord').classList.toggle('show', isRecord);
  $('btn-revive').classList.toggle('hidden', !canRevive);
  $('btn-x2coins').classList.toggle('hidden', !canDouble);
  showScreens('screen-gameover', 'hud');
  if (isRecord) {
    sfx.record();
    spawnConfetti();
  }
}

export function updateGameOverCoins(coins) {
  $('go-coins').textContent = coins;
  $('btn-x2coins').classList.add('hidden');
}

function spawnConfetti() {
  const box = $('confetti');
  box.innerHTML = '';
  const colors = ['#ffb020', '#ff4d6d', '#35e0ff', '#7ee081', '#ffe259'];
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
    s.style.animationDelay = `${Math.random() * 0.7}s`;
    s.style.transform = `scale(${0.6 + Math.random() * 0.8})`;
    box.append(s);
  }
}
