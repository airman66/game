// Экраны, HUD, гараж. Вся разметка — в index.html, здесь только логика.

import * as THREE from 'three';
import { spawnModel, CAR_IDS } from './assets.js';
import { t, carName } from './i18n.js';
import { getSave, updateSave, flushSave } from './save.js';
import { sfx, setSoundEnabled, isSoundEnabled, unlockAudio, startMusic } from './audio.js';

export const CAR_PRICES = {
  'sedan-sports': 0, 'hatchback-sports': 300, suv: 600, taxi: 1000, van: 1500,
  police: 2200, 'suv-luxury': 3000, ambulance: 4000, race: 5500,
  firetruck: 7500, 'garbage-truck': 10000, 'race-future': 15000,
};

const $ = (id) => document.getElementById(id);

const screens = ['screen-loading', 'screen-menu', 'screen-garage', 'hud', 'screen-pause', 'screen-gameover'];

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
  toast(key, pts) {
    const el = $('hud-toast');
    el.textContent = t(key) + (pts ? ` +${pts}` : '');
    el.classList.remove('show');
    void el.offsetWidth; // перезапуск CSS-анимации
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
};

// ---------- Меню ----------

export function refreshMenu() {
  const save = getSave();
  $('menu-best-value').textContent = save.best;
  $('menu-coins-value').textContent = save.coins;
  updateSoundButton();
}

function updateSoundButton() {
  $('btn-sound').textContent = isSoundEnabled() ? '🔊' : '🔇';
}

export function bindSoundButton() {
  $('btn-sound').addEventListener('click', () => {
    const on = !isSoundEnabled();
    setSoundEnabled(on);
    updateSave({ sound: on });
    updateSoundButton();
    if (on) sfx.click();
  });
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

// ---------- Игра окончена ----------

export function showGameOver({ score, coins, best, isRecord, canRevive }) {
  $('go-score').textContent = score;
  $('go-best').textContent = best;
  $('go-coins').textContent = coins;
  $('go-newrecord').classList.toggle('show', isRecord);
  $('btn-revive').classList.toggle('hidden', !canRevive);
  showScreens('screen-gameover', 'hud');
  if (isRecord) sfx.record();
}

// Первый жест пользователя — разблокируем аудио и включаем музыку
export function armAudioUnlock() {
  const unlock = () => {
    unlockAudio();
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
