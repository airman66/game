// Точка входа: SDK Яндекс Игр, загрузка, игровой цикл, ввод, реклама, жизненный цикл.

import './style.css';
import * as ysdk from './yandex.js';
import { setLanguage, t, achName, rankName } from './i18n.js';
import { accumulateTotals, checkAchievements, addXp } from './achievements.js';
import { loadAssets } from './assets.js';
import { initSave, getSave, updateSave, flushSave } from './save.js';
import { createGame, MODES } from './game.js';
import { initMissions, applyRunStats } from './missions.js';
import * as ui from './ui.js';
import {
  sfx, setSoundEnabled, setMusicEnabled, suspendAudio, resumeAudio,
  unlockAudio, playMusic, preloadAudioFiles,
} from './audio.js';

const canvas = document.getElementById('game-canvas');
let game = null;
let adActive = false;
let uiState = 'loading'; // loading | menu | garage | missions | leaderboard | settings | running | paused | over
let coinsDoubled = false;
let lastRunCoins = 0;
let lastGarageAdAt = 0;

function vibrate(ms) {
  if (!getSave().vibro) return;
  try { navigator.vibrate?.(ms); } catch (e) { /* noop */ }
}

async function boot() {
  const sdkPromise = ysdk.initSDK().catch(() => null);
  await loadAssets((p) => ui.setLoadingProgress(p * 0.9));
  await sdkPromise;
  ui.setLoadingProgress(0.95);

  setLanguage(ysdk.getLanguage());
  await initSave();
  initMissions();
  ui.setLoadingProgress(1);

  const save = getSave();
  setSoundEnabled(save.sound);
  setMusicEnabled(save.music);

  game = createGame(canvas, {
    onScore: (score, speed) => { ui.hud.setScore(score); ui.hud.setSpeed(speed); },
    onCoins: (c) => ui.hud.setCoins(c),
    onToast: (key, pts, combo) => ui.hud.toast(key, pts, combo),
    onPowerups: (p) => ui.hud.setPowerups(p),
    onNitro: (v, active) => ui.hud.setNitro(v, active),
    onCombo: (c) => ui.hud.setCombo(c),
    onNitroState: (on) => { if (!on) ui.hud.setNitro(0, false); },
    onTimer: (sec) => ui.hud.setTimer(sec, true),
    onVibrate: (ms) => vibrate(ms),
    onRunStart: () => ysdk.gameplayStart(),
    onCrash: () => ysdk.gameplayStop(),
    onGameOver: handleGameOver,
  });
  game.setPlayerCar(save.selectedCar);
  if (save.quality === 'low') game.world.setQuality('low');

  bindUI();
  bindInput();
  bindLifecycle();
  armAudioUnlock();

  goMenu(false);
  requestAnimationFrame(tick);

  // Обязательный сигнал: игра готова
  ysdk.loadingReady();

  // Дебаг-хук для скриптов скриншотов (scripts/screenshots.mjs), только с ?debug
  if (new URLSearchParams(location.search).has('debug')) {
    window.__ttd = { game, startRun, gameOver: handleGameOver, goMenu };
  }

  // Музыка и звуковые файлы грузятся в фоне, не задерживая старт
  preloadAudioFiles();

  checkDailyBonus();
}

// ---------- Ежедневный бонус ----------

function checkDailyBonus() {
  const save = getSave();
  const today = new Date().toISOString().slice(0, 10);
  if (save.lastDaily === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = save.lastDaily === yesterday ? Math.min(save.dailyStreak + 1, 7) : 1;
  const reward = 40 + streak * 30;
  updateSave({ lastDaily: today, dailyStreak: streak, coins: save.coins + reward });
  flushSave();
  setTimeout(() => {
    ui.menuToast('🎁 ' + t('dailyBonus', { n: streak, r: reward }));
    sfx.daily();
    ui.refreshMenu();
  }, 800);
}

// ---------- Переходы ----------

function goMenu(withAd = true) {
  uiState = 'menu';
  game?.toMenu();
  ysdk.gameplayStop();
  ui.refreshMenu();
  ui.setMenuHint(ysdk.isMobile());
  ui.showScreens('screen-menu');
  playMusic('menu');
  ysdk.showBanner();
  if (withAd) maybeInterstitial();
}

function startRun(modeId) {
  uiState = 'running';
  coinsDoubled = false;
  ui.hud.setScore(0);
  ui.hud.setCoins(0);
  ui.hud.setSpeed(0);
  ui.hud.setNitro(0, false);
  ui.hud.setPowerups({ magnet: 0, x2: 0, shield: false });
  const modeTime = MODES[modeId]?.time ?? 0;
  ui.hud.setTimer(modeTime, modeTime > 0);
  ui.hud.setMobileButtons(ysdk.isMobile());
  ui.showScreens('hud');
  ysdk.hideBanner();
  ui.hud.setCombo(0);
  playMusic(MODES[modeId]?.music ?? 'race1');
  game.startRun(modeId);
  ui.showCountdown();
  showTutorialOnce();
}

// Первый заезд: крупная подсказка про управление под текущее устройство
let tutorialTimer = 0;

function showTutorialOnce() {
  if (getSave().tutorialSeen) return;
  updateSave({ tutorialSeen: true });
  const el = document.getElementById('tutorial-hint');
  el.textContent = t(ysdk.isMobile() ? 'hintMobile' : 'hintDesktop');
  el.classList.add('show');
  clearTimeout(tutorialTimer);
  tutorialTimer = setTimeout(() => el.classList.remove('show'), 6000);
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

function handleGameOver({ score, coins, canRevive, reason, stats }) {
  uiState = 'over';
  lastRunCoins = coins;
  const save = getSave();
  const isRecord = score > save.best;
  const newBest = Math.max(save.best, score);
  updateSave({ best: newBest, coins: save.coins + coins });

  // Задания, достижения, ранг
  const completed = applyRunStats(stats);
  accumulateTotals(stats, score);
  const freshAch = checkAchievements();
  const newRank = addXp(score);
  flushSave();
  ysdk.submitScore(newBest);
  ysdk.gameplayStop();
  ysdk.showBanner();

  ui.showGameOver({
    score, coins, best: newBest, isRecord, canRevive,
    canDouble: coins > 0, reason, stats,
  });
  // Очередь тостов: миссии → достижения → ранг
  let delay = 600;
  for (const m of completed) {
    setTimeout(() => { ui.menuToast('✅ ' + t('missionDone', { r: m.reward })); sfx.missionDone(); }, delay);
    delay += 2400;
  }
  for (const a of freshAch) {
    setTimeout(() => { ui.menuToast(`${a.icon} ` + t('achDone', { name: achName(a.id), r: a.reward })); sfx.missionDone(); }, delay);
    delay += 2400;
  }
  if (newRank >= 0) {
    setTimeout(() => { ui.menuToast('🏅 ' + t('rankUp', { name: rankName(newRank), r: newRank * 100 })); sfx.record(); }, delay);
  }
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
  ysdk.showInterstitial(adCallbacks);
}

// ---------- Кнопки ----------

function bindUI() {
  // blur: иначе после клика мышью кнопка остаётся в фокусе и Пробел/Enter
  // в заезде «нажимает» её снова (рестарт посреди игры)
  const on = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('click', () => { el.blur(); sfx.click(); fn(); });
  };

  on('btn-play', () => startRun('classic'));
  on('btn-sprint', () => startRun('sprint'));
  on('btn-rampage', () => startRun('rampage'));

  const refreshGarageAdBtn = () => {
    const btn = document.getElementById('btn-garage-ad');
    const left = 120_000 - (Date.now() - lastGarageAdAt);
    btn.disabled = left > 0;
    if (left > 0) setTimeout(refreshGarageAdBtn, Math.min(left + 50, 5000));
  };
  // Покупка машины может закрыть достижения «Полгаража»/«Коллекционер».
  // Вызывается ДО перестроения гаража внутри ui — счётчик монет учтёт награду.
  const onCarPurchase = () => {
    for (const a of checkAchievements()) {
      ui.menuToast(`${a.icon} ` + t('achDone', { name: achName(a.id), r: a.reward }));
      sfx.missionDone();
    }
  };
  on('btn-garage', () => {
    uiState = 'garage';
    ui.buildGarage((carId) => game.setPlayerCar(carId), onCarPurchase);
    refreshGarageAdBtn();
    ui.showScreens('screen-garage');
  });
  on('btn-garage-back', () => goMenu(false));
  on('btn-garage-ad', async () => {
    if (Date.now() - lastGarageAdAt < 120_000) return; // защита от спама
    const ok = await ysdk.showRewarded(adCallbacks);
    if (ok) {
      lastGarageAdAt = Date.now();
      updateSave({ coins: getSave().coins + 250 });
      flushSave();
      sfx.daily();
      ui.buildGarage((carId) => game.setPlayerCar(carId), onCarPurchase);
      refreshGarageAdBtn();
    }
  });

  on('btn-missions', () => {
    uiState = 'missions';
    ui.buildMissions();
    ui.showScreens('screen-menu', 'screen-missions');
  });
  on('btn-missions-back', () => goMenu(false));

  on('btn-achievements', () => {
    uiState = 'achievements';
    ui.buildAchievements();
    ui.showScreens('screen-menu', 'screen-achievements');
  });
  on('btn-ach-back', () => goMenu(false));

  on('btn-leaderboard', async () => {
    uiState = 'leaderboard';
    ui.buildLeaderboard([]);
    ui.showScreens('screen-menu', 'screen-leaderboard');
    const entries = await ysdk.getLeaderboardTop();
    if (uiState === 'leaderboard') ui.buildLeaderboard(entries);
  });
  on('btn-lb-back', () => goMenu(false));

  on('btn-settings', () => {
    uiState = 'settings';
    ui.refreshSettings();
    ui.showScreens('screen-menu', 'screen-settings');
  });
  on('btn-settings-back', () => goMenu(false));
  on('tgl-sound', () => {
    const v = !getSave().sound;
    updateSave({ sound: v });
    setSoundEnabled(v);
    ui.refreshSettings();
  });
  on('tgl-music', () => {
    const v = !getSave().music;
    updateSave({ music: v });
    setMusicEnabled(v);
    ui.refreshSettings();
  });
  on('tgl-vibro', () => {
    updateSave({ vibro: !getSave().vibro });
    vibrate(30);
    ui.refreshSettings();
  });
  on('tgl-quality', () => {
    const v = getSave().quality === 'low' ? 'auto' : 'low';
    updateSave({ quality: v });
    game.world.setQuality(v === 'low' ? 'low' : 'high');
    ui.refreshSettings();
  });

  on('btn-pause', () => pauseGame());
  on('btn-resume', () => resumeGame());
  on('btn-exit-menu', () => goMenu(true));
  on('btn-gameover-menu', () => goMenu(true));
  on('btn-restart', async () => {
    const modeId = game.state.modeId;
    await ysdk.showInterstitial(adCallbacks);
    startRun(modeId);
  });
  on('btn-revive', async () => {
    const rewarded = await ysdk.showRewarded(adCallbacks);
    if (rewarded && uiState === 'over') {
      uiState = 'running';
      ui.showScreens('hud');
      ysdk.hideBanner();
      game.revive();
    }
  });
  on('btn-x2coins', async () => {
    if (coinsDoubled || lastRunCoins <= 0) return;
    const rewarded = await ysdk.showRewarded(adCallbacks);
    if (rewarded && !coinsDoubled) {
      coinsDoubled = true;
      updateSave({ coins: getSave().coins + lastRunCoins });
      flushSave();
      sfx.daily();
      ui.updateGameOverCoins(lastRunCoins * 2);
    }
  });

  // Кнопки на HUD
  document.getElementById('btn-nitro').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game?.nitro();
  });
  document.getElementById('btn-horn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game?.horn();
  });
}

// ---------- Ввод ----------

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let konamiPos = 0;
let logoTaps = 0;
let logoTapTimer = 0;

function grantCheat() {
  if (getSave().konami) return;
  updateSave({ konami: true, coins: getSave().coins + 500 });
  flushSave();
  ui.menuToast('😎 ' + t('konami'));
  sfx.record();
  ui.refreshMenu();
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    // Игровые клавиши не должны скроллить страницу/активировать кнопки
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    // Конами-код в меню
    if (uiState === 'menu') {
      konamiPos = e.code === KONAMI[konamiPos] ? konamiPos + 1 : (e.code === KONAMI[0] ? 1 : 0);
      if (konamiPos === KONAMI.length) { konamiPos = 0; grantCheat(); }
    }
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') game?.steer(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') game?.steer(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
      if (uiState === 'running') game?.nitro();
      else if (uiState === 'menu' && e.code !== 'ArrowUp') startRun('classic');
    } else if (e.code === 'KeyG' || e.code === 'KeyH') {
      if (uiState === 'running') game?.horn();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (uiState === 'running') pauseGame();
      else if (uiState === 'paused') resumeGame();
    }
  });

  // Пасхалка: 7 быстрых тапов по логотипу
  document.getElementById('menu-logo').addEventListener('pointerdown', () => {
    logoTaps++;
    clearTimeout(logoTapTimer);
    logoTapTimer = setTimeout(() => { logoTaps = 0; }, 700);
    if (logoTaps >= 7) { logoTaps = 0; grantCheat(); }
  });

  // Тач: свайп — руль (гориз.) и нитро (вверх), короткий тап по краю — тоже руль
  let swipe = null;
  window.addEventListener('pointerdown', (e) => {
    if (uiState !== 'running' || e.target?.closest?.('button')) return;
    swipe = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, usedY: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!swipe || uiState !== 'running') return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      game.steer(dx > 0 ? 1 : -1);
      swipe = { ...swipe, x: e.clientX, y: e.clientY, moved: true };
    } else if (!swipe.usedY && dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      swipe.usedY = true;
      swipe.moved = true;
      game.nitro();
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (swipe && !swipe.moved && uiState === 'running' && performance.now() - swipe.t < 320) {
      const k = e.clientX / window.innerWidth;
      if (k < 0.45) game.steer(-1);
      else if (k > 0.55) game.steer(1);
    }
    swipe = null;
  });
  window.addEventListener('pointercancel', () => { swipe = null; });
}

// ---------- Жизненный цикл вкладки (требование Яндекс Игр) ----------

function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      suspendAudio();
      if (uiState === 'running') pauseGame();
    } else if (!adActive) {
      resumeAudio();
    }
  });
  window.addEventListener('blur', () => {
    if (uiState === 'running') pauseGame();
  });
  window.addEventListener('beforeunload', () => flushSave());
}

function armAudioUnlock() {
  const unlock = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
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

  if (!qualityLowered && getSave().quality !== 'low') {
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
