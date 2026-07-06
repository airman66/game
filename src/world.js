// Сцена: дорога, обочины, освещение, декорации. Стиль — низкополигональный закат.

import * as THREE from 'three';
import { spawnModel } from './assets.js';

export const LANES = [-3.3, -1.1, 1.1, 3.3];
export const ROAD_HALF = 5.6;
export const SPAWN_Z = -170;
export const DESPAWN_Z = 28;

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

  // Небо: градиент заката на CanvasTexture
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const g = skyCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#141a3d');
  grad.addColorStop(0.45, '#4b3a7a');
  grad.addColorStop(0.72, '#c65f7f');
  grad.addColorStop(0.88, '#ff9d6b');
  grad.addColorStop(1.0, '#ffc98a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(400, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  scene.fog = new THREE.Fog(0xc65f7f, 60, 210);

  // Солнце — плоский диск у горизонта
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 })
  );
  sun.position.set(-40, 26, -330);
  scene.add(sun);

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

  // Земля по бокам
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: 0x8a5a44 })
  );
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

  // Обочины-полосы
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 500),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(side * (ROAD_HALF - 0.1), 0.005, -160);
    scene.add(stripe);
  }

  // Разметка: белые штрихи между полосами (InstancedMesh, скроллятся)
  const DASH_LINES = [-2.2, 0, 2.2];
  const DASH_STEP = 9;
  const DASH_COUNT_PER_LINE = 26;
  const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 2.6);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8e8f0 });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, DASH_LINES.length * DASH_COUNT_PER_LINE);
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

  // Отбойники: статичные рельсы + скроллящиеся столбики
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.22, 500),
      new THREE.MeshLambertMaterial({ color: 0xb9c0cc })
    );
    rail.position.set(side * (ROAD_HALF + 0.55), 0.62, -160);
    scene.add(rail);
  }
  const POST_STEP = 12;
  const POST_COUNT = 40; // по 20 на сторону
  const postGeo = new THREE.BoxGeometry(0.12, 0.62, 0.12);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e7686 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, POST_COUNT);
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

  // Деревья и камни на обочинах (скроллятся и рециклятся)
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
      20 - i * ((260) / 46) - rng() * 3
    );
    p.rotation.y = rng() * Math.PI * 2;
    p.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(p);
    props.push(p);
  }

  // Далёкие горы-силуэты
  const mountainMat = new THREE.MeshBasicMaterial({ color: 0x2e2450, fog: false });
  for (let i = 0; i < 9; i++) {
    const h = 30 + rng() * 46;
    const mnt = new THREE.Mesh(new THREE.ConeGeometry(34 + rng() * 30, h, 4), mountainMat);
    mnt.position.set((rng() - 0.5) * 460, h / 2 - 4, -300 - rng() * 60);
    mnt.rotation.y = rng() * Math.PI;
    scene.add(mnt);
  }

  const tmpM = new THREE.Matrix4();

  function update(dt, speed) {
    const dz = speed * dt;
    // Разметка
    for (let i = 0; i < dashOffsets.length; i++) {
      const d = dashOffsets[i];
      d.z += dz;
      if (d.z > 24) d.z -= DASH_COUNT_PER_LINE * DASH_STEP;
      tmpM.setPosition(d.x, 0.01, d.z);
      dashes.setMatrixAt(i, tmpM);
    }
    dashes.instanceMatrix.needsUpdate = true;
    // Столбики
    for (let i = 0; i < postOffsets.length; i++) {
      const p = postOffsets[i];
      p.z += dz;
      if (p.z > 24) p.z -= (POST_COUNT / 2) * POST_STEP;
      tmpM.setPosition(p.x, 0.31, p.z);
      posts.setMatrixAt(i, tmpM);
    }
    posts.instanceMatrix.needsUpdate = true;
    // Декорации
    for (const p of props) {
      p.position.z += dz;
      if (p.position.z > 26) p.position.z -= 260;
    }
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    // В портретной ориентации шире угол обзора, чтобы дорога помещалась
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

  return { renderer, scene, camera, update, onResize, setQuality, dirLight: dir };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
