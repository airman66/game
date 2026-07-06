// Обёртка над Yandex Games SDK v2.
// Все методы безопасны: при недоступности SDK (локальная разработка,
// сбой сети) игра продолжает работать без него.

const INTERSTITIAL_COOLDOWN_MS = 75_000; // чаще Яндекс всё равно не покажет

let ysdk = null;
let player = null;
let lastInterstitialAt = 0;
let gameplayRunning = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

export async function initSDK() {
  try {
    // На хостинге Яндекс Игр SDK всегда доступен по относительному пути /sdk.js
    await loadScript('/sdk.js');
    ysdk = await YaGames.init();
  } catch (e) {
    console.warn('[YSDK] SDK unavailable, running standalone', e);
    ysdk = null;
    return null;
  }
  try {
    player = await ysdk.getPlayer();
  } catch (e) {
    player = null;
  }
  return ysdk;
}

export function getLanguage() {
  return ysdk?.environment?.i18n?.lang || (navigator.language || 'en').slice(0, 2);
}

export function isMobile() {
  const type = ysdk?.deviceInfo?.type;
  if (type) return type === 'mobile' || type === 'tablet';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || 'ontouchstart' in window;
}

// --- Обязательные события жизненного цикла ---

export function loadingReady() {
  try { ysdk?.features?.LoadingAPI?.ready(); } catch (e) { /* noop */ }
}

export function gameplayStart() {
  if (gameplayRunning) return;
  gameplayRunning = true;
  try { ysdk?.features?.GameplayAPI?.start(); } catch (e) { /* noop */ }
}

export function gameplayStop() {
  if (!gameplayRunning) return;
  gameplayRunning = false;
  try { ysdk?.features?.GameplayAPI?.stop(); } catch (e) { /* noop */ }
}

// --- Реклама ---
// onPause должен заглушить звук и остановить рендер, onResume — вернуть.

export function showInterstitial({ onPause, onResume }) {
  return new Promise((resolve) => {
    const now = Date.now();
    if (!ysdk || now - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) {
      resolve(false);
      return;
    }
    lastInterstitialAt = now;
    let paused = false;
    const pause = () => { if (!paused) { paused = true; onPause?.(); } };
    const resume = (shown) => { if (paused || shown !== undefined) onResume?.(); resolve(!!shown); };
    try {
      pause();
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: pause,
          onClose: (wasShown) => resume(wasShown),
          onError: () => resume(false),
          onOffline: () => resume(false),
        },
      });
    } catch (e) {
      resume(false);
    }
  });
}

export function showRewarded({ onPause, onResume }) {
  return new Promise((resolve) => {
    if (!ysdk) {
      // Локальная разработка: считаем награду полученной, чтобы можно было тестировать.
      resolve(true);
      return;
    }
    let rewarded = false;
    try {
      onPause?.();
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => onPause?.(),
          onRewarded: () => { rewarded = true; },
          onClose: () => { onResume?.(); resolve(rewarded); },
          onError: () => { onResume?.(); resolve(false); },
        },
      });
    } catch (e) {
      onResume?.();
      resolve(false);
    }
  });
}

// --- Сохранения ---

export async function loadCloudData() {
  try {
    if (!player) return null;
    return await player.getData();
  } catch (e) {
    return null;
  }
}

export async function saveCloudData(data) {
  try {
    await player?.setData(data);
  } catch (e) { /* noop */ }
}

// --- Лидерборд ---

export async function submitScore(score) {
  try {
    if (!ysdk || !score) return;
    const lb = await ysdk.getLeaderboards();
    await lb.setLeaderboardScore('score', Math.floor(score));
  } catch (e) { /* игрок не авторизован или лидерборд не настроен — это ок */ }
}
