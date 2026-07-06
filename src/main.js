// Точка входа: инициализация SDK Яндекс Игр, загрузка ассетов, игровой цикл, ввод.

import './style.css';
import * as ysdk from './yandex.js';
import { setLanguage } from './i18n.js';
import { loadAssets } from './assets.js';
import { initSave, getSave, updateSave, flushSave } from './save.js';
import { createGame } from './game.js';
import * as ui from './ui.js';
import { sfx, setSoundEnabled, suspendAudio, resumeAudio, stopMusic, startMusic } from './audio.js';

const canvas = document.getElementById('game-canvas');
let game = null;
let adActive = false;
let uiState = 'loading'; // loading | menu | garage | running | paused | over

async function boot() {
  // SDK и ассеты грузим параллельно; сбой SDK не блокирует игру
  const sdkPromise = ysdk.initSDK().catch(() => null);
  await loadAssets((p) => ui.setLoadingProgress(p * 0.9));
  await sdkPromise;
  ui.setLoadingProgress(0.95);

  setLanguage(ysdk.getLanguage());
  await initSave();
  ui.setLoadingProgress(1);

  const save = getSave();
  setSoundEnabled(save.sound);

  game = createGame(canvas, {
    onScore: (score) => ui.hud.setScore(score),
    onCoins: (c) => ui.hud.setCoins(c),
    onToast: (key, pts) => ui.hud.toast(key, pts),
    onPowerups: (p) => ui.hud.setPowerups(p),
    onRunStart: () => ysdk.gameplayStart(),
    onCrash: () => ysdk.gameplayStop(),
    onGameOver: handleGameOver,
  });
  game.setPlayerCar(save.selectedCar);

  bindUI();
  bindInput();
  bindLifecycle();
  ui.armAudioUnlock();

  goMenu(false);
  requestAnimationFrame(tick);

  // Обязательный сигнал Яндекс Играм: игра загружена и готова
  ysdk.loadingReady();
}

// ---------- Переходы между экранами ----------

function goMenu(withAd = true) {
  uiState = 'menu';
  game?.toMenu();
  ysdk.gameplayStop();
  ui.refreshMenu();
  ui.setMenuHint(ysdk.isMobile());
  ui.showScreens('screen-menu');
  if (withAd) maybeInterstitial();
}

function startRun() {
  uiState = 'running';
  ui.hud.setScore(0);
  ui.hud.setCoins(0);
  ui.hud.setPowerups({ magnet: 0, x2: 0, shield: false });
  ui.showScreens('hud');
  game.startRun();
}

function pauseGame() {
  if (uiState !== 'running') return;
  uiState = 'paused';
  game.pause();
  ysdk.gameplayStop();
  ui.showScreens('screen-pause', 'hud');
}

function resumeGame() {
  if (uiState !== 'paused') return;
  uiState = 'running';
  ui.showScreens('hud');
  game.resume();
  ysdk.gameplayStart();
}

function handleGameOver({ score, coins, canRevive }) {
  uiState = 'over';
  const save = getSave();
  const isRecord = score > save.best;
  updateSave({
    best: Math.max(save.best, score),
    coins: save.coins + coins,
  });
  flushSave();
  ysdk.submitScore(Math.max(save.best, score));
  ui.showGameOver({ score, coins, best: Math.max(save.best, score), isRecord, canRevive });
}

// ---------- Реклама ----------

const adCallbacks = {
  onPause() {
    adActive = true;
    suspendAudio();
  },
  onResume() {
    adActive = false;
    resumeAudio();
  },
};

function maybeInterstitial() {
  // Показ в естественной паузе (переход в меню / рестарт), не чаще кулдауна
  ysdk.showInterstitial(adCallbacks);
}

// ---------- Кнопки ----------

function bindUI() {
  const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { sfx.click(); fn(); });

  on('btn-play', () => startRun());
  on('btn-garage', () => {
    uiState = 'garage';
    ui.buildGarage((carId) => game.setPlayerCar(carId));
    ui.showScreens('screen-garage');
  });
  on('btn-garage-back', () => goMenu(false));
  on('btn-pause', () => pauseGame());
  on('btn-resume', () => resumeGame());
  on('btn-exit-menu', () => goMenu(true));
  on('btn-gameover-menu', () => goMenu(true));
  on('btn-restart', async () => {
    await ysdk.showInterstitial(adCallbacks);
    startRun();
  });
  on('btn-revive', async () => {
    const rewarded = await ysdk.showRewarded(adCallbacks);
    if (rewarded && uiState === 'over') {
      uiState = 'running';
      ui.showScreens('hud');
      game.revive();
    }
  });
  ui.bindSoundButton();
}

// ---------- Ввод ----------

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') game?.steer(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') game?.steer(1);
    else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (uiState === 'running') pauseGame();
      else if (uiState === 'paused') resumeGame();
    } else if ((e.code === 'Space' || e.code === 'Enter') && uiState === 'menu') startRun();
  });

  // Свайпы: следим за pointer-жестами по всему экрану во время забега
  let swipe = null;
  window.addEventListener('pointerdown', (e) => {
    if (uiState !== 'running' || e.target?.closest?.('button')) return;
    swipe = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!swipe || uiState !== 'running') return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      game.steer(dx > 0 ? 1 : -1);
      swipe = { x: e.clientX, y: e.clientY }; // повторный свайп без отрыва пальца
    }
  });
  window.addEventListener('pointerup', () => { swipe = null; });
  window.addEventListener('pointercancel', () => { swipe = null; });
}

// ---------- Жизненный цикл вкладки (требование Яндекс Игр) ----------

function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      suspendAudio();
      stopMusic();
      if (uiState === 'running') pauseGame();
    } else if (!adActive) {
      resumeAudio();
      startMusic();
    }
  });
  window.addEventListener('beforeunload', () => flushSave());
}

// ---------- Игровой цикл ----------

let lastT = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fpsChecks = 0;
let qualityLowered = false;

function tick(now) {
  requestAnimationFrame(tick);
  if (adActive || document.hidden) { lastT = now; return; }
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  if (dt <= 0) return;

  game.update(dt);
  game.render();

  // Автоснижение качества при стабильно низком FPS
  if (!qualityLowered) {
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 3) {
      const fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      if (fps < 42 && ++fpsChecks >= 2) {
        qualityLowered = true;
        game.world.setQuality('low');
      }
    }
  }
}

boot();
