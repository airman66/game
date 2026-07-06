// Сцена: дорога, обочины, освещение, декорации, цикл день/ночь.
// Стиль — низкополигональный, палитра плавно меняется: закат → ночь → рассвет → день.

import * as THREE from 'three';
import { spawnModel } from './assets.js';

export const LANES = [-3.3, -1.1, 1.1, 3.3];
export const ROAD_HALF = 5.6;
export const SPAWN_Z = -170;
export const DESPAWN_Z = 28;

const DAY_CYCLE = 130; // секунд на полный цикл

// Ключевые кадры времени суток: закат(0) → ночь(.25) → рассвет(.5) → день(.75) → закат(1)
const TOD = [
  { sky: ['#141a3d', '#4b3a7a', '#c65f7f', '#ff9d6b', '#ffc98a'], fog: '#c65f7f', hemi: 0.85, dir: 2.0, dirCol: '#ffd2a0', ground: '#8a5a44', mount: '#2e2450', sun: 1.0, night: 0 },
  { sky: ['#070b18', '#0e1530', '#1a2550', '#233260', '#2c3d70'], fog: '#1a2550', hemi: 0.58, dir: 0.85, dirCol: '#93aaff', ground: '#3c3852', mount: '#100d26', sun: 0.0, night: 1 },
  { sky: ['#1a2150', '#6b4a8a', '#d97a8a', '#ffb27a', '#ffd9a0'], fog: '#d97a8a', hemi: 0.7, dir: 1.6, dirCol: '#ffc9a0', ground: '#7a5544', mount: '#3a2a55', sun: 0.7, night: 0.12 },
  { sky: ['#2f6fc9', '#5f9ade', '#9cc4e8', '#c8e0f2', '#e6f2fa'], fog: '#9cc4e8', hemi: 1.05, dir: 2.3, dirCol: '#fff2dd', ground: '#6f7a4e', mount: '#41597a', sun: 1.0, night: 0 },
];

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  // Небо — градиент на CanvasTexture, перерисовывается при смене времени суток
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(sky);

  scene.fog = new THREE.Fog(0xc65f7f, 60, 210);

  // Солнце/луна — диск у горизонта
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 })
  );
  sun.position.set(-40, 26, -330);
  scene.add(sun);

  // Звёзды (видны только ночью)
  const starGeo = new THREE.BufferGeometry();
  {
    const pts = [];
    for (let i = 0; i < 240; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = 0.12 + Math.random() * 1.3;
      const r = 380;
      pts.push(r * Math.cos(el) * Math.sin(a), r * Math.sin(el), -Math.abs(r * Math.cos(el) * Math.cos(a)) - 20);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  // Свет
  const hemi = new THREE.HemisphereLight(0xcdd6ff, 0x3d2a3a, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffd2a0, 2.0);
  dir.position.set(-14, 24, -10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -14;
  dir.shadow.camera.right = 14;
  dir.shadow.camera.top = 10;
  dir.shadow.camera.bottom = -60;
  dir.shadow.camera.near = 4;
  dir.shadow.camera.far = 70;
  dir.shadow.bias = -0.0008;
  scene.add(dir);
  scene.add(dir.target);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.5, 500);
  camera.position.set(0, 5.4, 9.2);
  camera.lookAt(0, 1.1, -8);

  // Земля
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8a5a44 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // Полотно дороги
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2 + 1.2, 500),
    new THREE.MeshLambertMaterial({ color: 0x2b2f3e })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -160);
  road.receiveShadow = true;
  scene.add(road);

  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 500),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(side * (ROAD_HALF - 0.1), 0.005, -160);
    scene.add(stripe);
  }

  // Сплошная двойная жёлтая слева от полосы 0 — граница встречки
  const oncomingLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 500),
    new THREE.MeshBasicMaterial({ color: 0xd9a012, transparent: true, opacity: 0 })
  );
  oncomingLine.rotation.x = -Math.PI / 2;
  oncomingLine.position.set(LANES[0] + 1.1, 0.014, -160);
  scene.add(oncomingLine);

  // Разметка
  const DASH_LINES = [-2.2, 0, 2.2];
  const DASH_STEP = 9;
  const DASH_COUNT_PER_LINE = 26;
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.02, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xe8e8f0 }),
    DASH_LINES.length * DASH_COUNT_PER_LINE
  );
  const dashOffsets = [];
  {
    const m = new THREE.Matrix4();
    let i = 0;
    for (const x of DASH_LINES) {
      for (let k = 0; k < DASH_COUNT_PER_LINE; k++) {
        const z = 20 - k * DASH_STEP;
        dashOffsets.push({ x, z });
        m.setPosition(x, 0.01, z);
        dashes.setMatrixAt(i++, m);
      }
    }
  }
  scene.add(dashes);

  // Отбойники
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.22, 500),
      new THREE.MeshLambertMaterial({ color: 0xb9c0cc })
    );
    rail.position.set(side * (ROAD_HALF + 0.55), 0.62, -160);
    scene.add(rail);
  }
  const POST_STEP = 12;
  const POST_COUNT = 40;
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.62, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x6e7686 }),
    POST_COUNT
  );
  const postOffsets = [];
  {
    const m = new THREE.Matrix4();
    let i = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < POST_COUNT / 2; k++) {
        const z = 20 - k * POST_STEP;
        postOffsets.push({ x: side * (ROAD_HALF + 0.55), z });
        m.setPosition(side * (ROAD_HALF + 0.55), 0.31, z);
        posts.setMatrixAt(i++, m);
      }
    }
  }
  scene.add(posts);

  // Деревья и камни
  const props = [];
  const PROP_MODELS = ['tree_pineTallA', 'tree_pineTallB', 'tree_oak', 'rock_largeA', 'rock_largeB'];
  const rng = mulberry32(20260706);
  for (let i = 0; i < 46; i++) {
    const id = PROP_MODELS[Math.floor(rng() * PROP_MODELS.length)];
    const p = spawnModel(id);
    const s = (id.startsWith('tree') ? 4.2 : 2.6) * (0.8 + rng() * 0.7);
    p.scale.setScalar(s);
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(
      side * (ROAD_HALF + 2.6 + rng() * 14),
      0,
      20 - i * (260 / 46) - rng() * 3
    );
    p.rotation.y = rng() * Math.PI * 2;
    p.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(p);
    props.push(p);
  }

  // Мосты над трассой — редкие, проносятся над головой
  const bridges = [];
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x55607a });
  const bridgeEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const spanW = (ROAD_HALF + 3.2) * 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(spanW, 1.3, 2.6), bridgeMat);
    beam.position.y = 5.6;
    b.add(beam);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(spanW, 0.16, 2.7), bridgeEdgeMat);
    edge.position.y = 4.9;
    b.add(edge);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.0, 2.2), bridgeMat);
      pillar.position.set(side * (ROAD_HALF + 2.4), 2.5, 0);
      b.add(pillar);
    }
    b.position.z = -260 - i * 300;
    scene.add(b);
    bridges.push(b);
  }

  // Горы
  const mountainMat = new THREE.MeshBasicMaterial({ color: 0x2e2450, fog: false });
  for (let i = 0; i < 9; i++) {
    const h = 30 + rng() * 46;
    const mnt = new THREE.Mesh(new THREE.ConeGeometry(34 + rng() * 30, h, 4), mountainMat);
    mnt.position.set((rng() - 0.5) * 460, h / 2 - 4, -300 - rng() * 60);
    mnt.rotation.y = rng() * Math.PI;
    scene.add(mnt);
  }

  // ---------- Время суток ----------

  let tod = 0; // 0..1, старт — закат
  let night = 0;
  const cA = new THREE.Color(), cB = new THREE.Color();

  function lerpColor(hexA, hexB, k) {
    cA.set(hexA); cB.set(hexB);
    return cA.lerp(cB, k);
  }

  function applyTimeOfDay(dt) {
    tod = (tod + dt / DAY_CYCLE) % 1;
    const seg = Math.floor(tod * 4);
    const k = smooth(tod * 4 - seg);
    const A = TOD[seg % 4], B = TOD[(seg + 1) % 4];

    // Небо
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    const stops = [0, 0.45, 0.72, 0.88, 1];
    for (let i = 0; i < 5; i++) {
      grad.addColorStop(stops[i], '#' + lerpColor(A.sky[i], B.sky[i], k).getHexString());
    }
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 4, 256);
    skyTex.needsUpdate = true;

    scene.fog.color.copy(lerpColor(A.fog, B.fog, k));
    hemi.intensity = A.hemi + (B.hemi - A.hemi) * k;
    dir.intensity = A.dir + (B.dir - A.dir) * k;
    dir.color.copy(lerpColor(A.dirCol, B.dirCol, k));
    groundMat.color.copy(lerpColor(A.ground, B.ground, k));
    mountainMat.color.copy(lerpColor(A.mount, B.mount, k));
    sun.material.opacity = A.sun + (B.sun - A.sun) * k;
    night = A.night + (B.night - A.night) * k;
    starMat.opacity = night * 0.95;
  }
  applyTimeOfDay(0);

  const tmpM = new THREE.Matrix4();

  function update(dt, speed) {
    applyTimeOfDay(dt);
    const dz = speed * dt;
    for (let i = 0; i < dashOffsets.length; i++) {
      const d = dashOffsets[i];
      d.z += dz;
      if (d.z > 24) d.z -= DASH_COUNT_PER_LINE * DASH_STEP;
      tmpM.setPosition(d.x, 0.01, d.z);
      dashes.setMatrixAt(i, tmpM);
    }
    dashes.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < postOffsets.length; i++) {
      const p = postOffsets[i];
      p.z += dz;
      if (p.z > 24) p.z -= (POST_COUNT / 2) * POST_STEP;
      tmpM.setPosition(p.x, 0.31, p.z);
      posts.setMatrixAt(i, tmpM);
    }
    posts.instanceMatrix.needsUpdate = true;
    for (const p of props) {
      p.position.z += dz;
      if (p.position.z > 26) p.position.z -= 260;
    }
    for (const b of bridges) {
      b.position.z += dz;
      if (b.position.z > 34) b.position.z -= 560 + Math.random() * 120;
    }
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.fov = h > w ? 78 : 64;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  function setQuality(level) { // 'high' | 'low'
    if (level === 'low') {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      renderer.shadowMap.enabled = false;
      dir.castShadow = false;
    } else {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      dir.castShadow = true;
    }
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  return {
    renderer, scene, camera, update, onResize, setQuality,
    getNight: () => night,
    setOncomingVisible: (on) => { oncomingLine.material.opacity = on ? 0.9 : 0; },
  };
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
