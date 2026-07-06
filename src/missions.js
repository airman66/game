// Задания: три активных, выполняются в заездах, награда — монеты.
// С каждым выполненным заданием цели растут.

import { getSave, updateSave } from './save.js';

// perRun: прогресс = лучший результат за один заезд; total: копится между заездами
const TYPES = [
  { type: 'coins_run', perRun: true, base: 25, growth: 1.5, reward: 120, stat: 'coins' },
  { type: 'dist_run', perRun: true, base: 800, growth: 1.5, reward: 120, stat: 'dist' },
  { type: 'near_run', perRun: true, base: 4, growth: 1.45, reward: 150, stat: 'near' },
  { type: 'overtake_run', perRun: true, base: 12, growth: 1.5, reward: 120, stat: 'overtakes' },
  { type: 'time_run', perRun: true, base: 45, growth: 1.35, reward: 130, stat: 'time' },
  { type: 'cones_total', perRun: false, base: 6, growth: 1.7, reward: 150, stat: 'cones' },
  { type: 'nitro_total', perRun: false, base: 2, growth: 1.6, reward: 150, stat: 'nitroUses' },
  { type: 'ram_total', perRun: false, base: 3, growth: 1.7, reward: 200, stat: 'rams' },
];

function makeMission(typeDef, level) {
  const scale = Math.pow(typeDef.growth, level);
  return {
    type: typeDef.type,
    goal: Math.round(typeDef.base * scale / (typeDef.base >= 100 ? 100 : 1)) * (typeDef.base >= 100 ? 100 : 1),
    progress: 0,
    reward: Math.round(typeDef.reward * (1 + level * 0.5) / 10) * 10,
  };
}

function rollNew(existingTypes, level) {
  const pool = TYPES.filter((d) => !existingTypes.includes(d.type));
  const def = pool[Math.floor(Math.random() * pool.length)] ?? TYPES[0];
  return makeMission(def, level);
}

export function initMissions() {
  const save = getSave();
  if (!Array.isArray(save.missions) || save.missions.length !== 3) {
    const missions = [];
    for (let i = 0; i < 3; i++) {
      missions.push(rollNew(missions.map((m) => m.type), 0));
    }
    updateSave({ missions, missionLevel: 0 });
  }
}

export function getMissions() {
  return getSave().missions ?? [];
}

// Вызывается после каждого заезда. Возвращает список выполненных заданий.
export function applyRunStats(stats) {
  const save = getSave();
  const missions = (save.missions ?? []).map((m) => ({ ...m }));
  let level = save.missionLevel ?? 0;
  const completed = [];

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    const def = TYPES.find((d) => d.type === m.type);
    if (!def) continue;
    const value = Math.floor(stats[def.stat] ?? 0);
    m.progress = def.perRun ? Math.max(m.progress, Math.min(value, m.goal)) : Math.min(m.progress + value, m.goal);
    if (m.progress >= m.goal) {
      completed.push({ ...m });
      level += 1;
      missions[i] = rollNew(missions.filter((_, j) => j !== i).map((x) => x.type), level);
    }
  }

  const totalReward = completed.reduce((s, m) => s + m.reward, 0);
  updateSave({
    missions,
    missionLevel: level,
    coins: (getSave().coins ?? 0) + totalReward,
  });
  return completed;
}
