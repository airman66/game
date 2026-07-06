// Игровая логика: машина игрока, трафик, монеты, пауэрапы, столкновения, очки.

import * as THREE from 'three';
import { createWorld, LANES, SPAWN_Z, DESPAWN_Z } from './world.js';
import { spawnModel, TRAFFIC_IDS } from './assets.js';
import { sfx, startEngine, stopEngine, setEngineSpeed } from './audio.js';

const BASE_SPEED = 21;
const MAX_SPEED = 68;
const RAMP_TIME = 250;        // секунд до максимальной скорости
const CAR_LEN = 2.35;         // длина легковушки игрока
const LANE_SWITCH_SPEED = 9;  // скорость смены полосы (х-лерп)

export function createGame(canvas, hooks) {
  const world = createWorld(canvas);
  const { scene, camera } = world;

  // ---------- Машина игрока ----------
  let playerCar = null;
  let playerHalf = new THREE.Vector3(0.7, 0.5, 1.1);
  let currentCarId = null;

  function setPlayerCar(id) {
    if (playerCar) scene.remove(playerCar);
    currentCarId = id;
    playerCar = spawnModel(id, CAR_LEN);
    playerCar.rotation.y = Math.PI; // модели Kenney смотрят на +Z, игрок едет в -Z
    playerCar.position.set(0, 0, 0);
    scene.add(playerCar);
    const s = playerCar.userData.size;
    const k = CAR_LEN / s.z;
    playerHalf.set(s.x * k * 0.5 * 0.72, s.y * k * 0.5, s.z * k * 0.5 * 0.8);
  }

  // Щит-сфера
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x53ffa9, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shieldMesh.visible = false;
  scene.add(shieldMesh);

  // ---------- Пулы объектов ----------
  const traffic = []; // {obj, lane, v, half, passed, alive}
  const coins = [];   // {mesh, alive}
  const cones = [];   // {obj, alive, popped, vel}
  const powerups = []; // {mesh, type, alive}
  const particles = []; // {mesh, vel, spin, life}

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
  const partMat = new THREE.MeshBasicMaterial({ color: 0xffa751 });

  // ---------- Состояние забега ----------
  const S = {
    mode: 'idle', // idle | running | paused | crashing | over
    elapsed: 0,
    speed: 0,
    score: 0,
    coins: 0,
    lane: 1,
    targetX: LANES[1],
    distSinceRow: 999,
    safeLane: 1,
    prevSafeLane: 1,
    nextPowerupIn: 14,
    magnetT: 0,
    x2T: 0,
    shieldOn: false,
    shieldGraceT: 0,
    shieldFromRevive: false,
    reviveUsed: false,
    crashT: 0,
    shake: 0,
    fovKick: 0,
  };

  let rng = Math.random;

  // ---------- Спавн ----------
  function difficulty() {
    return Math.min(1, S.elapsed / RAMP_TIME);
  }

  function spawnTrafficRow(baseZ = SPAWN_Z) {
    const d = difficulty();
    // Безопасная полоса гуляет на ±1 — всегда существует проходимый маршрут
    S.prevSafeLane = S.safeLane;
    if (rng() < 0.55) {
      const dir = rng() < 0.5 ? -1 : 1;
      S.safeLane = Math.min(3, Math.max(0, S.safeLane + dir));
    }
    const blocked = new Set([S.safeLane, S.prevSafeLane]); // и переход между ними свободен
    const candidates = [0, 1, 2, 3].filter((l) => !blocked.has(l));
    let count = 1 + (rng() < 0.35 + d * 0.45 ? 1 : 0);
    count = Math.min(count, candidates.length);
    // перемешиваем
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < count; i++) {
      const lane = candidates[i];
      const id = TRAFFIC_IDS[Math.floor(rng() * TRAFFIC_IDS.length)];
      const isTruck = id === 'truck' || id === 'delivery';
      const len = isTruck ? 3.4 : 2.3 + rng() * 0.25;
      const obj = spawnModel(id, len);
      obj.rotation.y = Math.PI;
      obj.position.set(LANES[lane], 0, baseZ - rng() * 14);
      scene.add(obj);
      const sz = obj.userData.size;
      const k = len / sz.z;
      traffic.push({
        obj, lane,
        v: (isTruck ? 8.5 : 10.5) + rng() * 5.5,
        half: new THREE.Vector3(sz.x * k * 0.5 * 0.78, sz.y * k * 0.5, sz.z * k * 0.5 * 0.85),
        passed: false,
        alive: true,
      });
    }
    // Монеты на безопасной полосе
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
    // Иногда — конусы ремонта на краю занятой полосы (сбиваются без аварии)
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

  function spawnPowerup() {
    const types = ['magnet', 'x2', 'shield'];
    const type = types[Math.floor(rng() * types.length)];
    const mesh = new THREE.Mesh(puGeos[type], puMats[type]);
    mesh.position.set(LANES[S.safeLane], 1.0, SPAWN_Z - 6);
    mesh.userData.type = type;
    scene.add(mesh);
    powerups.push({ mesh, type, alive: true });
  }

  function burstParticles(pos, n, color) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(partGeo, partMat.clone());
      mesh.material.color.set(color);
      mesh.position.copy(pos);
      scene.add(mesh);
      particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 0.9,
      });
    }
  }

  // ---------- Очистка забега ----------
  function clearRun() {
    for (const t of traffic) scene.remove(t.obj);
    for (const c of coins) scene.remove(c.mesh);
    for (const c of cones) scene.remove(c.obj);
    for (const p of powerups) scene.remove(p.mesh);
    for (const p of particles) scene.remove(p.mesh);
    traffic.length = coins.length = cones.length = powerups.length = particles.length = 0;
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

  // ---------- Жизненный цикл ----------
  function startRun() {
    clearRun();
    Object.assign(S, {
      mode: 'running', elapsed: 0, speed: BASE_SPEED, score: 0, coins: 0,
      lane: 1, targetX: LANES[1], distSinceRow: 999, safeLane: 2, prevSafeLane: 2,
      nextPowerupIn: 12, magnetT: 0, x2T: 0, shieldOn: false, reviveUsed: false,
      shieldGraceT: 0, shieldFromRevive: false, crashT: 0, shake: 0,
    });
    playerCar.position.set(LANES[1], 0, 0);
    playerCar.rotation.set(0, Math.PI, 0);
    // Предзаполняем шоссе, чтобы экшен начинался сразу
    for (let z = -55; z >= SPAWN_Z; z -= 30) spawnTrafficRow(z);
    startEngine();
    hooks.onRunStart?.();
  }

  function crash() {
    S.mode = 'crashing';
    S.crashT = 0;
    S.shake = 1;
    sfx.crash();
    stopEngine();
    burstParticles(playerCar.position.clone().setY(0.7), 16, 0xffa751);
    burstParticles(playerCar.position.clone().setY(0.5), 10, 0x666a77);
    hooks.onCrash?.();
  }

  function finishCrash() {
    S.mode = 'over';
    hooks.onGameOver?.({
      score: Math.floor(S.score),
      coins: S.coins,
      canRevive: !S.reviveUsed,
    });
  }

  function revive() {
    S.reviveUsed = true;
    S.mode = 'running';
    // Расчищаем зону вокруг игрока
    for (const t of traffic) {
      if (t.alive && t.obj.position.z > -75) {
        t.alive = false;
        scene.remove(t.obj);
      }
    }
    playerCar.rotation.set(0, Math.PI, 0);
    playerCar.position.y = 0;
    S.lane = closestLane(playerCar.position.x);
    S.targetX = LANES[S.lane];
    S.shieldOn = true; // защита на первые секунды
    S.shieldFromRevive = true;
    S.shieldGraceT = 3.5;
    S.speed = Math.max(BASE_SPEED, S.speed * 0.7);
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
    playerCar.position.set(0, 0, 0);
    playerCar.rotation.set(0, Math.PI, 0);
  }

  // ---------- Основной цикл ----------
  const tmpBox = new THREE.Box3();
  let idleT = 0;

  function update(dt) {
    if (S.mode === 'running') updateRun(dt);
    else if (S.mode === 'crashing') updateCrash(dt);
    else if (S.mode === 'idle') updateIdle(dt);
    updateParticles(dt);
    updateCamera(dt);
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
    S.speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * d;
    setEngineSpeed(d);

    const mult = S.x2T > 0 ? 2 : 1;
    S.score += S.speed * dt * mult * 0.55;
    hooks.onScore?.(Math.floor(S.score), S.speed);

    // Движение мира
    world.update(dt, S.speed);

    // Смена полосы
    const px = playerCar.position.x;
    const dx = S.targetX - px;
    playerCar.position.x += dx * Math.min(1, dt * LANE_SWITCH_SPEED);
    playerCar.rotation.y = Math.PI + THREE.MathUtils.clamp(-dx * 0.14, -0.32, 0.32);
    playerCar.rotation.z = THREE.MathUtils.clamp(dx * 0.05, -0.12, 0.12);

    // Таймеры пауэрапов
    if (S.magnetT > 0) S.magnetT -= dt;
    if (S.x2T > 0) S.x2T -= dt;
    if (S.shieldGraceT > 0) {
      S.shieldGraceT -= dt;
      if (S.shieldGraceT <= 0 && S.reviveUsed && S.shieldOn && S.shieldFromRevive) S.shieldOn = false;
    }
    shieldMesh.visible = S.shieldOn;
    if (S.shieldOn) {
      shieldMesh.position.copy(playerCar.position).setY(0.8);
      shieldMesh.rotation.y += dt * 1.5;
    }
    hooks.onPowerups?.({ magnet: S.magnetT, x2: S.x2T, shield: S.shieldOn });

    // Спавн рядов
    S.distSinceRow += S.speed * dt;
    const rowGap = 62 - 26 * d;
    if (S.distSinceRow >= rowGap) {
      S.distSinceRow = 0;
      spawnTrafficRow();
    }
    S.nextPowerupIn -= dt;
    if (S.nextPowerupIn <= 0) {
      S.nextPowerupIn = 16 + rng() * 14;
      spawnPowerup();
    }

    // Трафик
    for (const t of traffic) {
      if (!t.alive) continue;
      t.obj.position.z += (S.speed - t.v) * dt;
      if (t.obj.position.z > DESPAWN_Z) {
        t.alive = false;
        scene.remove(t.obj);
        continue;
      }
      const pz = t.obj.position.z;
      const pdx = Math.abs(t.obj.position.x - playerCar.position.x);
      // Столкновение (AABB с щадящими зазорами)
      if (Math.abs(pz) < t.half.z + playerHalf.z && pdx < t.half.x + playerHalf.x) {
        if (S.shieldOn) {
          S.shieldOn = false;
          S.shieldFromRevive = false;
          sfx.shieldPop();
          burstParticles(t.obj.position.clone().setY(0.8), 12, 0x53ffa9);
          t.alive = false;
          scene.remove(t.obj);
          S.shake = 0.5;
        } else {
          crash();
          return;
        }
      } else if (!t.passed && pz > playerHalf.z + t.half.z) {
        // Проехали мимо: проверка «на волоске»
        t.passed = true;
        if (pdx < t.half.x + playerHalf.x + 0.85) {
          S.score += 25 * mult;
          sfx.nearMiss();
          hooks.onToast?.('nearMiss', 25 * mult);
          S.fovKick = Math.min(S.fovKick + 2.5, 6);
        }
      }
    }

    // Конусы
    for (const c of cones) {
      if (!c.alive) continue;
      c.obj.position.z += S.speed * dt;
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
          sfx.click();
        }
      }
      if (c.obj.position.z > DESPAWN_Z) { c.alive = false; scene.remove(c.obj); }
    }

    // Монеты
    for (const c of coins) {
      if (!c.alive) continue;
      const m = c.mesh;
      m.position.z += S.speed * dt;
      m.rotation.z += dt * 4;
      if (S.magnetT > 0) {
        const dv = new THREE.Vector3().subVectors(playerCar.position, m.position).setY(0);
        const dist = dv.length();
        if (dist < 9) m.position.addScaledVector(dv.normalize(), dt * (26 - dist * 2));
      }
      const pdx = Math.abs(m.position.x - playerCar.position.x);
      if (Math.abs(m.position.z) < 1.5 && pdx < playerHalf.x + 0.75) {
        c.alive = false;
        scene.remove(m);
        S.coins += 1;
        S.score += 10 * mult;
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
      p.mesh.position.z += S.speed * dt;
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
      p.vel.y -= 14 * dt;
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.material.opacity = p.life;
      p.mesh.material.transparent = true;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    const portrait = window.innerHeight > window.innerWidth;
    const baseFov = portrait ? 78 : 64;
    S.fovKick = Math.max(0, S.fovKick - dt * 4);
    const speedFov = S.mode === 'running' ? (S.speed - BASE_SPEED) * 0.16 : 0;
    camera.fov = baseFov + speedFov + S.fovKick;
    camera.updateProjectionMatrix();

    S.shake = Math.max(0, S.shake - dt * 1.6);
    const shX = (Math.random() - 0.5) * S.shake * 0.5;
    const shY = (Math.random() - 0.5) * S.shake * 0.4;

    if (S.mode === 'idle') {
      // В меню камера медленно кружит вокруг машины
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
