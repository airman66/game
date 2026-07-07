// Достижения: накопительные тоталы в save.totals, проверка после каждого заезда.
// Награда — монеты. Названия/описания — в i18n (achNames/achDescs).

import { getSave, updateSave } from './save.js';

export const ACH_DEFS = [
  { id: 'first', icon: '🏁', reward: 50, get: (t) => [t.runs, 1] },
  { id: 'dist10', icon: '🛣', reward: 100, get: (t) => [t.dist, 10000] },
  { id: 'dist100', icon: '🌍', reward: 300, get: (t) => [t.dist, 100000] },
  { id: 'near50', icon: '⚡', reward: 100, get: (t) => [t.near, 50] },
  { id: 'near500', icon: '🌩', reward: 300, get: (t) => [t.near, 500] },
  { id: 'combo5', icon: '🔗', reward: 150, get: (t) => [t.bestCombo, 5] },
  { id: 'combo10', icon: '💫', reward: 400, get: (t) => [t.bestCombo, 10] },
  { id: 'coins1k', icon: '💰', reward: 200, get: (t) => [t.coins, 1000] },
  { id: 'rams50', icon: '💥', reward: 200, get: (t) => [t.rams, 50] },
  { id: 'cones100', icon: '🚧', reward: 150, get: (t) => [t.cones, 100] },
  { id: 'score10k', icon: '🎯', reward: 150, get: (t) => [t.maxScore, 10000] },
  { id: 'score50k', icon: '🏆', reward: 500, get: (t) => [t.maxScore, 50000] },
  { id: 'onc25', icon: '😈', reward: 200, get: (t) => [t.oncoming, 25] },
  { id: 'nitro100', icon: '🔥', reward: 250, get: (t) => [t.nitro, 100] },
  { id: 'time180', icon: '⏱', reward: 250, get: (t) => [t.bestTime, 180] },
  { id: 'cars6', icon: '🚗', reward: 250, get: (t, s) => [s.ownedCars.length, 6] },
  { id: 'cars12', icon: '🏎', reward: 1000, get: (t, s) => [s.ownedCars.length, 12] },
  { id: 'ufo', icon: '🛸', reward: 100, get: (t) => [t.ufo ? 1 : 0, 1] },
];

// Копит тоталы из статов заезда. Вызывать до checkAchievements.
export function accumulateTotals(stats, score) {
  const s = getSave();
  const t = { ...s.totals };
  t.runs += 1;
  t.dist += Math.floor(stats.dist);
  t.near += stats.near;
  t.oncoming += stats.oncoming ?? 0;
  t.rams += stats.rams;
  t.cones += stats.cones;
  t.nitro += stats.nitroUses;
  t.coins += stats.coins;
  t.bestCombo = Math.max(t.bestCombo, stats.bestCombo ?? 0);
  t.maxScore = Math.max(t.maxScore, score);
  t.bestTime = Math.max(t.bestTime, Math.floor(stats.time));
  t.ufo = t.ufo || !!stats.ufo;
  updateSave({ totals: t });
}

// Возвращает список свежеразблокированных достижений (и начисляет награды).
export function checkAchievements() {
  const s = getSave();
  const unlocked = [...s.achUnlocked];
  const fresh = [];
  for (const def of ACH_DEFS) {
    if (unlocked.includes(def.id)) continue;
    const [cur, target] = def.get(s.totals, s);
    if (cur >= target) {
      unlocked.push(def.id);
      fresh.push(def);
    }
  }
  if (fresh.length) {
    updateSave({
      achUnlocked: unlocked,
      coins: s.coins + fresh.reduce((sum, d) => sum + d.reward, 0),
    });
  }
  return fresh;
}

export function achievementProgress() {
  const s = getSave();
  return ACH_DEFS.map((def) => {
    const [cur, target] = def.get(s.totals, s);
    return { ...def, cur: Math.min(cur, target), target, done: s.achUnlocked.includes(def.id) };
  });
}

// ---------- Ранги (XP = суммарный счёт / 100) ----------

export const RANK_THRESHOLDS = [0, 300, 900, 2000, 4000, 7000, 11000, 17000, 25000, 36000, 50000, 70000];

export function rankFromXp(xp) {
  let r = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) if (xp >= RANK_THRESHOLDS[i]) r = i;
  return r;
}

// Начисляет XP за заезд; возвращает новый ранг или -1, если ранг не вырос.
export function addXp(score) {
  const s = getSave();
  const xp = (s.xp ?? 0) + Math.floor(score / 100);
  const oldRank = rankFromXp(s.xp ?? 0);
  const newRank = rankFromXp(xp);
  const patch = { xp };
  if (newRank > oldRank) patch.coins = s.coins + newRank * 100;
  updateSave(patch);
  return newRank > oldRank ? newRank : -1;
}

export function rankInfo() {
  const s = getSave();
  const xp = s.xp ?? 0;
  const rank = rankFromXp(xp);
  const cur = RANK_THRESHOLDS[rank];
  const next = RANK_THRESHOLDS[rank + 1] ?? null;
  return { rank, xp, progress: next ? (xp - cur) / (next - cur) : 1, maxed: next === null };
}
