// Игровая логика: режимы, машина игрока, трафик (попутный и встречный),
// нитро с тараном, комбо, монеты, пауэрапы, сирены, гудок, НЛО и прочие приколы.

import * as THREE from 'three';
import { createWorld, LANES, SPAWN_Z, DESPAWN_Z } from './world.js';
import { spawnModel, TRAFFIC_IDS } from './assets.js';
import { sfx, startEngine, stopEngine, setEngineSpeed, createSiren } from './audio.js';

const CAR_LEN = 2.35;
const LANE_SWITCH_SPEED = 9;
const NITRO_MULT = 1.5;
const NITRO_TIME = 3.6;

export const MODES = {
  classic: { time: 0, base: 21, max: 68, ramp: 250, oncomingAfter: 20, invuln: false, music: 'race1' },
  sprint: { time: 90, base: 34, max: 82, ramp: 90, oncomingAfter: 0, invuln: false, music: 'race2' },
  rampage: { time: 60, base: 30, max: 48, ramp: 60, oncomingAfter: 0, invuln: true, music: 'rampage' },
};

const SPECIAL_CARS = [
  { id: 'police', siren: 'police' },
  { id: 'ambulance', siren: 'wail' },
  { id: 'firetruck', siren: 'wail' },
];

export function createGame(canvas, hooks) {
  const world = createWorld(canvas);
  const { scene, camera } = world;

  // Габаритные огни — общие материалы, яркость зависит от времени суток
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.5 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.3 });
  const lightGeo = new THREE.BoxGeometry(0.17, 0.075, 0.045);

  function addLights(wrapper, oncoming) {
    const s = wrapper.userData.size;
    const mat = oncoming ? headMat : tailMat;
    const zEdge = (oncoming ? 1 : -1) * s.z * 0.505;
    for (const sideX of [-1, 1]) {
      const m = new THREE.Mesh(lightGeo, mat);
      m.position.set(sideX * s.x * 0.3, s.y * 0.55, zEdge);
      wrapper.add(m);
    }
  }

  // ---------- Машина игрока ----------
  let playerCar = null;
  let playerHalf = new THREE.Vector3(0.7, 0.5, 1.1);
  let currentCarId = null;

  const headlight = new THREE.PointLight(0xffe8c0, 0, 18, 2);
  scene.add(headlight);

  function setPlayerCar(id) {
    if (playerCar) scene.remove(playerCar);
    currentCarId = id;
    playerCar = spawnModel(id, CAR_LEN);
    playerCar.rotation.y = Math.PI; // модели Kenney смотрят на +Z, игрок едет в -Z
    playerCar.position.set(0, 0, 0);
    addLights(playerCar, false);
    scene.add(playerCar);
    const s = playerCar.userData.size;
    const k = CAR_LEN / s.z;
    playerHalf.set(s.x * k * 0.5 * 0.72, s.y * k * 0.5, s.z * k * 0.5 * 0.8);
  }

  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x53ffa9, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shieldMesh.visible = false;
  scene.add(shieldMesh);

  // ---------- Пулы ----------
  const traffic = [];
  const coins = [];
  const cones = [];
  const powerups = [];
  const particles = [];

  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18);
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffc21d, emissive: 0xb97800, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.3,
  });
  const puGeos = {
    magnet: new THREE.IcosahedronGeometry(0.55, 0),
    shield: new THREE.OctahedronGeometry(0.6, 0),
    x2: new THREE.TorusGeometry(0.42, 0.17, 10, 18),
  };
  const puMats = {
    magnet: new THREE.MeshStandardMaterial({ color: 0x35e0ff, emissive: 0x1187a8, emissiveIntensity: 0.8 }),
    shield: new THREE.MeshStandardMaterial({ color: 0x53ffa9, emissive: 0x1f8a54, emissiveIntensity: 0.8 }),
    x2: new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xa8173a, emissiveIntensity: 0.8 }),
  };
  const partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const partBase = new THREE.MeshBasicMaterial({ color: 0xffa751, transparent: true });

  // ---------- Состояние ----------
  const S = {
    mode: 'idle', // idle | running | paused | crashing | over
    modeId: 'classic',
    cfg: MODES.classic,
    elapsed: 0,
    timeLeft: 0,
    speed: 0,
    score: 0,
    coins: 0,
    lane: 1,
    targetX: LANES[1],
    distSinceRow: 999,
    safeLane: 1,
    prevSafeLane: 1,
    nextPowerupIn: 14,
    oncomingOn: false,
    oncomingNext: 3,
    magnetT: 0,
    x2T: 0,
    shieldOn: false,
    shieldGraceT: 0,
    shieldFromRevive: false,
    reviveUsed: false,
    nitro: 0,
    nitroT: 0,
    combo: 0,
    comboT: 0,
    hornCd: 0,
    smokeAcc: 0,
    flameAcc: 0,
    ufoNext: 40,
    crashT: 0,
    shake: 0,
    fovKick: 0,
    stats: null,
  };

  let rng = Math.random;

  function freshStats() {
    return { dist: 0, coins: 0, near: 0, overtakes: 0, cones: 0, nitroUses: 0, rams: 0, time: 0 };
  }

  function difficulty() {
    return Math.min(1, S.elapsed / S.cfg.ramp);
  }

  function effSpeed() {
    return S.speed * (S.nitroT > 0 ? NITRO_MULT : 1);
  }

  // ---------- Спавн ----------

  function laneRange() {
    return S.oncomingOn ? [1, 2, 3] : [0, 1, 2, 3];
  }

  function spawnTrafficRow(baseZ = SPAWN_Z) {
    const d = difficulty();
    const lanes = laneRange();
    const lo = lanes[0], hi = lanes[lanes.length - 1];
    S.prevSafeLane = S.safeLane = Math.min(hi, Math.max(lo, S.safeLane));
    if (rng() < 0.55) {
      const dir = rng() < 0.5 ? -1 : 1;
      const next = Math.min(hi, Math.max(lo, S.safeLane + dir));
      S.prevSafeLane = S.safeLane;
      S.safeLane = next;
    }
    const blocked = new Set([S.safeLane, S.prevSafeLane]);
    const candidates = lanes.filter((l) => !blocked.has(l));
    let count = 1 + (rng() < 0.35 + d * 0.45 ? 1 : 0);
    count = Math.min(count, candidates.length);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < count; i++) {
      spawnTrafficCar(candidates[i], baseZ - rng() * 14, false);
    }
    if (rng() < 0.62) {
      const n = 5 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(LANES[S.safeLane], 0.75, baseZ - 20 - i * 3.2);
        scene.add(mesh);
        coins.push({ mesh, alive: true });
      }
    }
    if (rng() < 0.16 + d * 0.1) {
      const lane = candidates[count] ?? S.prevSafeLane;
      for (let i = 0; i < 3; i++) {
        const obj = spawnModel('cone', 0.55);
        obj.position.set(LANES[lane] + (rng() - 0.5) * 0.8, 0, baseZ - 30 - i * 2.2);
        scene.add(obj);
        cones.push({ obj, alive: true, popped: false, vel: null });
      }
    }
  }

  function spawnTrafficCar(lane, z, oncoming) {
    let id, sirenKind = null;
    if (!oncoming && rng() < 0.07) {
      const sp = SPECIAL_CARS[Math.floor(rng() * SPECIAL_CARS.length)];
      id = sp.id;
      sirenKind = sp.siren;
    } else {
      id = TRAFFIC_IDS[Math.floor(rng() * TRAFFIC_IDS.length)];
      if (oncoming && (id === 'truck' || id === 'delivery')) id = 'sedan';
    }
    const isTruck = id === 'truck' || id === 'delivery' || id === 'firetruck';
    const len = isTruck ? 3.4 : 2.3 + rng() * 0.25;
    const obj = spawnModel(id, len);
    obj.rotation.y = oncoming ? 0 : Math.PI;
    obj.position.set(LANES[lane], 0, z);
    addLights(obj, oncoming);
    scene.add(obj);
    const sz = obj.userData.size;
    const k = len / sz.z;
    const v = oncoming
      ? -(14 + rng() * 8)
      : (sirenKind ? 15 + rng() * 4 : (isTruck ? 8.5 : 10.5) + rng() * 5.5);
    traffic.push({
      obj, lane, v, oncoming,
      half: new THREE.Vector3(sz.x * k * 0.5 * 0.78, sz.y * k * 0.5, sz.z * k * 0.5 * 0.85),
      passed: false,
      alive: true,
      siren: sirenKind ? createSiren(sirenKind) : null,
      dodgeT: 0,
      baseX: LANES[lane],
    });
  }

  function spawnOncoming() {
    spawnTrafficCar(0, SPAWN_Z - rng() * 10, true);
    // Монеты на встречке — риск и награда
    if (rng() < 0.35) {
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(LANES[0], 0.75, SPAWN_Z - 26 - i * 3.4);
        scene.add(mesh);
        coins.push({ mesh, alive: true });
      }
    }
  }

  function spawnPowerup() {
    const types = ['magnet', 'x2', 'shield'];
    const type = types[Math.floor(rng() * types.length)];
    const mesh = new THREE.Mesh(puGeos[type], puMats[type]);
    mesh.position.set(LANES[S.safeLane], 1.0, SPAWN_Z - 6);
    scene.add(mesh);
    powerups.push({ mesh, type, alive: true });
  }

  function emitParticle(pos, vel, color, life = 0.9, size = 1, grav = 14) {
    const mesh = new THREE.Mesh(partGeo, partBase.clone());
    mesh.material.color.set(color);
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    scene.add(mesh);
    particles.push({
      mesh, vel,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      life, maxLife: life, grav,
    });
  }

  function burstParticles(pos, n, color) {
    for (let i = 0; i < n; i++) {
      emitParticle(
        pos.clone(),
        new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7),
        color
      );
    }
  }

  // ---------- НЛО (пасхалка, летает ночью в классике) ----------

  let ufo = null;

  function buildUfo() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x9aa4c0, metalness: 0.6, roughness: 0.4 })
    );
    body.scale.y = 0.32;
    g.add(body);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.75 })
    );
    dome.position.y = 0.4;
    g.add(dome);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (let i = 0; i < 6; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), dotMat);
      const a = (i / 6) * Math.PI * 2;
      dot.position.set(Math.cos(a) * 1.7, -0.1, Math.sin(a) * 1.7);
      g.add(dot);
    }
    return g;
  }

  function maybeStartUfo(dt) {
    if (ufo || S.modeId !== 'classic' || world.getNight() < 0.4) return;
    S.ufoNext -= dt;
    if (S.ufoNext > 0) return;
    S.ufoNext = 55 + rng() * 60;
    const mesh = buildUfo();
    scene.add(mesh);
    ufo = { mesh, t: 0 };
    sfx.ufo();
  }

  function updateUfo(dt) {
    if (!ufo) return;
    ufo.t += dt;
    const k = ufo.t / 7;
    ufo.mesh.position.set(
      -34 + k * 66 + Math.sin(ufo.t * 2.2) * 4,
      24 + Math.sin(ufo.t * 1.4) * 3,
      -120 + k * 70
    );
    ufo.mesh.rotation.y += dt * 2;
    if (k >= 1) {
      scene.remove(ufo.mesh);
      ufo = null;
      if (S.mode === 'running') {
        S.coins += 100;
        hooks.onCoins?.(S.coins);
        hooks.onToast?.('ufo');
        hooks.onVibrate?.(60);
      }
    }
  }

  // ---------- Очистка ----------

  function clearRun() {
    for (const t of traffic) { t.siren?.stop(); scene.remove(t.obj); }
    for (const c of coins) scene.remove(c.mesh);
    for (const c of cones) scene.remove(c.obj);
    for (const p of powerups) scene.remove(p.mesh);
    for (const p of particles) scene.remove(p.mesh);
    traffic.length = coins.length = cones.length = powerups.length = particles.length = 0;
    if (ufo) { scene.remove(ufo.mesh); ufo = null; }
  }

  // ---------- Управление ----------

  function steer(dir) {
    if (S.mode !== 'running') return;
    const next = Math.min(LANES.length - 1, Math.max(0, S.lane + dir));
    if (next !== S.lane) {
      S.lane = next;
      S.targetX = LANES[next];
    }
  }

  function nitro() {
    if (S.mode !== 'running' || S.nitro < 100 || S.nitroT > 0) return false;
    S.nitroT = NITRO_TIME;
    S.nitro = 0;
    S.stats.nitroUses++;
    sfx.nitro();
    hooks.onNitroState?.(true);
    hooks.onVibrate?.(40);
    S.fovKick = Math.min(S.fovKick + 5, 10);
    return true;
  }

  function horn() {
    if (S.mode !== 'running' || S.hornCd > 0) return;
    S.hornCd = 1.6;
    sfx.horn();
    hooks.onVibrate?.(20);
    // Ближайшая попутная машина впереди шарахается
    let best = null, bz = -1e9;
    for (const t of traffic) {
      if (t.alive && !t.oncoming && t.obj.position.z < 0 && t.obj.position.z > -30 && t.obj.position.z > bz) {
        best = t; bz = t.obj.position.z;
      }
    }
    if (best) {
      best.dodgeT = 0.9;
      if (rng() < 0.35) setTimeout(() => sfx.hornReply(), 350);
    }
  }

  // ---------- Жизненный цикл ----------

  function startRun(modeId = 'classic') {
    clearRun();
    const cfg = MODES[modeId] ?? MODES.classic;
    Object.assign(S, {
      mode: 'running', modeId, cfg,
      elapsed: 0, timeLeft: cfg.time, speed: cfg.base, score: 0, coins: 0,
      lane: 1, targetX: LANES[1], distSinceRow: 999, safeLane: 2, prevSafeLane: 2,
      nextPowerupIn: 12, magnetT: 0, x2T: 0, shieldOn: false, reviveUsed: false,
      shieldGraceT: 0, shieldFromRevive: false, crashT: 0, shake: 0,
      nitro: 0, nitroT: 0, combo: 0, comboT: 0, hornCd: 0,
      oncomingOn: cfg.oncomingAfter === 0, oncomingNext: 2.5,
      smokeAcc: 0, flameAcc: 0, ufoNext: 35 + rng() * 40,
      stats: freshStats(),
    });
    world.setOncomingVisible(S.oncomingOn);
    playerCar.position.set(LANES[1], 0, 0);
    playerCar.rotation.set(0, Math.PI, 0);
    for (let z = -55; z >= SPAWN_Z; z -= 30) spawnTrafficRow(z);
    if (S.oncomingOn) {
      spawnTrafficCar(0, -80, true);
      spawnTrafficCar(0, -150, true);
    }
    startEngine();
    hooks.onRunStart?.();
  }

  function crash() {
    S.mode = 'crashing';
    S.crashT = 0;
    S.shake = 1;
    S.combo = 0;
    sfx.crash();
    stopEngine();
    for (const t of traffic) t.siren?.stop();
    burstParticles(playerCar.position.clone().setY(0.7), 16, 0xffa751);
    burstParticles(playerCar.position.clone().setY(0.5), 10, 0x666a77);
    hooks.onVibrate?.(180);
    hooks.onCrash?.();
  }

  function finishByTimer() {
    S.mode = 'over';
    stopEngine();
    for (const t of traffic) t.siren?.stop();
    hooks.onGameOver?.({
      score: Math.floor(S.score),
      coins: S.coins,
      canRevive: false,
      reason: 'time',
      stats: S.stats,
    });
  }

  function finishCrash() {
    S.mode = 'over';
    hooks.onGameOver?.({
      score: Math.floor(S.score),
      coins: S.coins,
      canRevive: S.modeId === 'classic' && !S.reviveUsed,
      reason: 'crash',
      stats: S.stats,
    });
  }

  function revive() {
    S.reviveUsed = true;
    S.mode = 'running';
    for (const t of traffic) {
      if (t.alive && t.obj.position.z > -75) {
        t.alive = false;
        t.siren?.stop();
        scene.remove(t.obj);
      }
    }
    playerCar.rotation.set(0, Math.PI, 0);
    playerCar.position.y = 0;
    S.lane = closestLane(playerCar.position.x);
    S.targetX = LANES[S.lane];
    S.shieldOn = true;
    S.shieldFromRevive = true;
    S.shieldGraceT = 3.5;
    S.speed = Math.max(S.cfg.base, S.speed * 0.7);
    sfx.revive();
    startEngine();
    hooks.onRunStart?.();
  }

  function closestLane(x) {
    let best = 0, bd = 1e9;
    LANES.forEach((lx, i) => { const d = Math.abs(lx - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function pause() {
    if (S.mode === 'running') {
      S.mode = 'paused';
      stopEngine();
      for (const t of traffic) t.siren?.stop();
    }
  }

  function resume() {
    if (S.mode === 'paused') {
      S.mode = 'running';
      startEngine();
    }
  }

  function toMenu() {
    clearRun();
    stopEngine();
    S.mode = 'idle';
    world.setOncomingVisible(false);
    playerCar.position.set(0, 0, 0);
    playerCar.rotation.set(0, Math.PI, 0);
  }

  // ---------- Основной цикл ----------

  let idleT = 0;

  function update(dt) {
    if (S.mode === 'running') updateRun(dt);
    else if (S.mode === 'crashing') updateCrash(dt);
    else if (S.mode === 'idle') updateIdle(dt);
    updateParticles(dt);
    updateUfo(dt);
    updateCamera(dt);
    updateLightsMats();
  }

  function updateLightsMats() {
    const night = world.getNight();
    tailMat.opacity = 0.35 + night * 0.65;
    headMat.opacity = 0.18 + night * 0.82;
    headlight.intensity = night * 2.6;
    if (playerCar) {
      headlight.position.set(playerCar.position.x, 1.3, playerCar.position.z - 4);
    }
  }

  function updateIdle(dt) {
    idleT += dt;
    world.update(dt, 7);
    playerCar.position.x += (0 - playerCar.position.x) * Math.min(1, dt * 4);
    playerCar.position.z += (0 - playerCar.position.z) * Math.min(1, dt * 4);
    shieldMesh.visible = false;
  }

  function updateRun(dt) {
    S.elapsed += dt;
    const d = difficulty();
    S.speed = S.cfg.base + (S.cfg.max - S.cfg.base) * d;
    const eff = effSpeed();
    setEngineSpeed(d + (S.nitroT > 0 ? 0.35 : 0));

    // Таймер режимов Спринт/Разгром
    if (S.cfg.time > 0) {
      const prev = Math.ceil(S.timeLeft);
      S.timeLeft -= dt;
      hooks.onTimer?.(Math.max(0, S.timeLeft));
      if (S.timeLeft <= 3.2 && Math.ceil(S.timeLeft) !== prev && S.timeLeft > 0) sfx.click();
      if (S.timeLeft <= 0) { finishByTimer(); return; }
    }

    // Включение встречки в классике
    if (!S.oncomingOn && S.cfg.oncomingAfter > 0 && S.elapsed >= S.cfg.oncomingAfter) {
      S.oncomingOn = true;
      world.setOncomingVisible(true);
    }

    const mult = S.x2T > 0 ? 2 : 1;
    S.score += eff * dt * mult * 0.55;
    S.stats.dist += eff * dt;
    S.stats.time = S.elapsed;
    hooks.onScore?.(Math.floor(S.score), eff);

    world.update(dt, eff);

    // Таймеры
    if (S.magnetT > 0) S.magnetT -= dt;
    if (S.x2T > 0) S.x2T -= dt;
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    if (S.hornCd > 0) S.hornCd -= dt;
    if (S.nitroT > 0) {
      S.nitroT -= dt;
      if (S.nitroT <= 0) hooks.onNitroState?.(false);
    }
    if (S.shieldGraceT > 0) {
      S.shieldGraceT -= dt;
      if (S.shieldGraceT <= 0 && S.shieldOn && S.shieldFromRevive) S.shieldOn = false;
    }
    hooks.onNitro?.(S.nitro, S.nitroT > 0);

    // Смена полосы + дым из-под колёс
    const px = playerCar.position.x;
    const dx = S.targetX - px;
    playerCar.position.x += dx * Math.min(1, dt * LANE_SWITCH_SPEED);
    playerCar.rotation.y = Math.PI + THREE.MathUtils.clamp(-dx * 0.14, -0.32, 0.32);
    playerCar.rotation.z = THREE.MathUtils.clamp(dx * 0.05, -0.12, 0.12);
    if (Math.abs(dx) > 0.55) {
      S.smokeAcc += dt;
      if (S.smokeAcc > 0.045) {
        S.smokeAcc = 0;
        emitParticle(
          new THREE.Vector3(px + (Math.random() - 0.5) * 0.6, 0.12, playerCar.position.z + 1.0),
          new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.4, 2.5),
          0x9aa3b5, 0.5, 1.3, -2
        );
      }
    }
    // Пламя нитро
    if (S.nitroT > 0) {
      S.flameAcc += dt;
      if (S.flameAcc > 0.028) {
        S.flameAcc = 0;
        const colors = [0xffd23e, 0xff7a3c, 0x4dd7ff];
        emitParticle(
          new THREE.Vector3(px + (Math.random() - 0.5) * 0.5, 0.35, playerCar.position.z + 1.25),
          new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6, 7 + Math.random() * 4),
          colors[Math.floor(Math.random() * 3)], 0.32, 1.1, 0
        );
      }
    }

    shieldMesh.visible = S.shieldOn;
    if (S.shieldOn) {
      shieldMesh.position.copy(playerCar.position).setY(0.8);
      shieldMesh.rotation.y += dt * 1.5;
    }
    hooks.onPowerups?.({ magnet: S.magnetT, x2: S.x2T, shield: S.shieldOn });

    // Спавн
    S.distSinceRow += eff * dt;
    const rowGap = 62 - 26 * d;
    if (S.distSinceRow >= rowGap) {
      S.distSinceRow = 0;
      spawnTrafficRow();
    }
    if (S.oncomingOn) {
      S.oncomingNext -= dt;
      if (S.oncomingNext <= 0) {
        S.oncomingNext = (S.modeId === 'rampage' ? 2.2 : 4.4) - d * 1.6 + rng() * 1.4;
        spawnOncoming();
      }
    }
    S.nextPowerupIn -= dt;
    if (S.nextPowerupIn <= 0) {
      S.nextPowerupIn = 16 + rng() * 14;
      spawnPowerup();
    }
    maybeStartUfo(dt);

    // Трафик
    for (const t of traffic) {
      if (!t.alive) continue;
      t.obj.position.z += (eff - t.v) * dt;
      // Шараханье от гудка
      if (t.dodgeT > 0) {
        t.dodgeT -= dt;
        t.obj.position.x = t.baseX + Math.sin(t.dodgeT * 12) * 0.3 * Math.min(1, t.dodgeT * 2);
      }
      if (t.obj.position.z > DESPAWN_Z) {
        t.alive = false;
        t.siren?.stop();
        scene.remove(t.obj);
        continue;
      }
      // Сирена с Доплером
      if (t.siren) {
        const rel = eff - t.v;
        const dop = t.obj.position.z < 0 ? 1 + rel / 300 : Math.max(0.75, 1 - rel / 300);
        t.siren.update(dt, Math.abs(t.obj.position.z), dop);
      }
      const pz = t.obj.position.z;
      const pdx = Math.abs(t.obj.position.x - playerCar.position.x);
      if (Math.abs(pz) < t.half.z + playerHalf.z && pdx < t.half.x + playerHalf.x) {
        if (S.nitroT > 0 || S.cfg.invuln) {
          // ТАРАН
          t.alive = false;
          t.siren?.stop();
          scene.remove(t.obj);
          const pts = (S.cfg.invuln ? 100 : 50) * (t.oncoming ? 2 : 1) * mult;
          S.score += pts;
          S.stats.rams++;
          S.nitro = Math.min(100, S.nitro + (S.cfg.invuln ? 8 : 0));
          if (S.cfg.invuln) { S.coins += 2; hooks.onCoins?.(S.coins); }
          sfx.ram();
          burstParticles(t.obj.position.clone().setY(0.8), 14, 0xffa751);
          burstParticles(t.obj.position.clone().setY(0.6), 8, 0x9aa3b5);
          S.shake = Math.max(S.shake, 0.45);
          S.fovKick = Math.min(S.fovKick + 2, 8);
          hooks.onToast?.('ram', pts);
          hooks.onVibrate?.(60);
        } else if (S.shieldOn) {
          S.shieldOn = false;
          S.shieldFromRevive = false;
          S.combo = 0;
          sfx.shieldPop();
          burstParticles(t.obj.position.clone().setY(0.8), 12, 0x53ffa9);
          t.alive = false;
          t.siren?.stop();
          scene.remove(t.obj);
          S.shake = 0.5;
          hooks.onVibrate?.(80);
        } else {
          crash();
          return;
        }
      } else if (!t.passed && pz > playerHalf.z + t.half.z) {
        t.passed = true;
        S.stats.overtakes++;
        if (pdx < t.half.x + playerHalf.x + 0.85) {
          // «На волоске» — комбо и нитро
          S.combo = S.comboT > 0 ? S.combo + 1 : 1;
          S.comboT = 4;
          const base = t.oncoming ? 50 : 25;
          const pts = base * S.combo * mult;
          S.score += pts;
          S.stats.near++;
          S.nitro = Math.min(100, S.nitro + (t.oncoming ? 30 : 20));
          if (S.nitro >= 100 && S.nitroT <= 0) hooks.onToast?.('nitroReady');
          else hooks.onToast?.(t.oncoming ? 'oncomingMiss' : 'nearMiss', pts, S.combo);
          sfx.nearMiss();
          if (rng() < 0.3) setTimeout(() => sfx.hornReply(), 250);
          S.fovKick = Math.min(S.fovKick + 2.5, 6);
          hooks.onVibrate?.(25);
        }
      }
    }

    // Конусы
    for (const c of cones) {
      if (!c.alive) continue;
      c.obj.position.z += eff * dt;
      if (c.popped) {
        c.obj.position.addScaledVector(c.vel, dt);
        c.vel.y -= 22 * dt;
        c.obj.rotation.x += dt * 9;
        if (c.obj.position.y < -2) { c.alive = false; scene.remove(c.obj); continue; }
      } else {
        const pdx = Math.abs(c.obj.position.x - playerCar.position.x);
        if (Math.abs(c.obj.position.z) < 1.4 && pdx < playerHalf.x + 0.35) {
          c.popped = true;
          c.vel = new THREE.Vector3((Math.random() - 0.5) * 6, 7, -4);
          S.score += 5;
          S.stats.cones++;
          S.nitro = Math.min(100, S.nitro + 4);
          sfx.cone();
        }
      }
      if (c.obj.position.z > DESPAWN_Z) { c.alive = false; scene.remove(c.obj); }
    }

    // Монеты
    for (const c of coins) {
      if (!c.alive) continue;
      const m = c.mesh;
      m.position.z += eff * dt;
      m.rotation.z += dt * 4;
      if (S.magnetT > 0 || S.nitroT > 0) {
        const r = S.magnetT > 0 ? 9 : 4.5;
        const dv = new THREE.Vector3().subVectors(playerCar.position, m.position).setY(0);
        const dist = dv.length();
        if (dist < r) m.position.addScaledVector(dv.normalize(), dt * (26 - dist * 2));
      }
      const pdx = Math.abs(m.position.x - playerCar.position.x);
      if (Math.abs(m.position.z) < 1.5 && pdx < playerHalf.x + 0.75) {
        c.alive = false;
        scene.remove(m);
        S.coins += 1;
        S.stats.coins += 1;
        S.score += 10 * mult;
        S.nitro = Math.min(100, S.nitro + 2.5);
        sfx.coin();
        hooks.onCoins?.(S.coins);
      } else if (m.position.z > DESPAWN_Z) {
        c.alive = false;
        scene.remove(m);
      }
    }

    // Пауэрапы
    for (const p of powerups) {
      if (!p.alive) continue;
      p.mesh.position.z += eff * dt;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = 1.0 + Math.sin(p.mesh.rotation.y * 2) * 0.15;
      const pdx = Math.abs(p.mesh.position.x - playerCar.position.x);
      if (Math.abs(p.mesh.position.z) < 1.6 && pdx < playerHalf.x + 0.8) {
        p.alive = false;
        scene.remove(p.mesh);
        sfx.powerup();
        if (p.type === 'magnet') S.magnetT = 9;
        else if (p.type === 'x2') S.x2T = 11;
        else { S.shieldOn = true; S.shieldFromRevive = false; }
        hooks.onToast?.(p.type);
        burstParticles(p.mesh.position, 10, p.mesh.material.color.getHex());
        hooks.onVibrate?.(30);
      } else if (p.mesh.position.z > DESPAWN_Z) {
        p.alive = false;
        scene.remove(p.mesh);
      }
    }

    compact(traffic); compact(coins); compact(cones); compact(powerups);
  }

  function updateCrash(dt) {
    S.crashT += dt;
    const decel = Math.max(0, 1 - S.crashT * 1.6);
    world.update(dt, S.speed * decel * 0.4);
    playerCar.rotation.y += dt * 7 * decel;
    playerCar.rotation.z += dt * 3.5 * decel;
    playerCar.position.y = Math.max(0, Math.sin(Math.min(S.crashT * 6, Math.PI)) * 0.7);
    if (S.crashT >= 1.05) finishCrash();
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.mesh); continue; }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= p.grav * dt;
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.material.opacity = p.life / p.maxLife;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    const portrait = window.innerHeight > window.innerWidth;
    const baseFov = portrait ? 78 : 64;
    S.fovKick = Math.max(0, S.fovKick - dt * 4);
    const speedFov = S.mode === 'running'
      ? (effSpeed() - S.cfg.base) * 0.16
      : 0;
    camera.fov = baseFov + speedFov + S.fovKick;
    camera.updateProjectionMatrix();

    S.shake = Math.max(0, S.shake - dt * 1.6);
    const shX = (Math.random() - 0.5) * S.shake * 0.5;
    const shY = (Math.random() - 0.5) * S.shake * 0.4;

    if (S.mode === 'idle') {
      const a = idleT * 0.22;
      camera.position.set(Math.sin(a) * 7.5, 3.4 + Math.sin(idleT * 0.5) * 0.4, Math.cos(a) * 7.5);
      camera.lookAt(0, 0.8, 0);
    } else {
      const targetCamX = playerCar.position.x * 0.42;
      camera.position.x += (targetCamX - camera.position.x) * Math.min(1, dt * 5) + shX;
      camera.position.y = (portrait ? 6.1 : 5.4) + shY;
      camera.position.z = portrait ? 10.4 : 9.2;
      camera.lookAt(camera.position.x * 0.5, 1.0, -9);
    }
  }

  function compact(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (!arr[i].alive) arr.splice(i, 1);
    }
  }

  function render() {
    world.renderer.render(scene, camera);
  }

  return {
    world,
    state: S,
    setPlayerCar,
    steer,
    nitro,
    horn,
    startRun,
    pause,
    resume,
    revive,
    toMenu,
    update,
    render,
    getCurrentCar: () => currentCarId,
  };
}
