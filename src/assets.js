// Загрузка GLB-моделей (Kenney Car Kit + Nature Kit, лицензия CC0).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const CAR_IDS = [
  'sedan-sports', 'hatchback-sports', 'suv', 'taxi', 'van', 'police',
  'suv-luxury', 'ambulance', 'race', 'firetruck', 'garbage-truck', 'race-future',
];

export const TRAFFIC_IDS = ['sedan', 'suv', 'van', 'taxi', 'delivery', 'truck', 'hatchback-sports', 'suv-luxury'];

const PROP_IDS = ['tree_pineTallA', 'tree_pineTallB', 'tree_oak', 'rock_largeA', 'rock_largeB', 'cone'];

const ALL_IDS = [...new Set([...CAR_IDS, ...TRAFFIC_IDS, ...PROP_IDS, 'sedan'])];

const models = new Map();

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(ALL_IDS.map(async (id) => {
    const gltf = await loader.loadAsync(`assets/models/${id}.glb`);
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        if (o.material) {
          o.material.roughness = 0.85;
          o.material.metalness = 0.05;
        }
      }
    });
    models.set(id, scene);
    done++;
    onProgress?.(done / ALL_IDS.length);
  }));
}

// Возвращает клон модели, приведённый к длине targetLen по оси Z,
// стоящий на y=0 и с центром по X/Z в нуле.
export function spawnModel(id, targetLen = null) {
  const src = models.get(id);
  const obj = src.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  obj.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(obj);
  if (targetLen) {
    const s = targetLen / size.z;
    wrapper.scale.setScalar(s);
  }
  wrapper.userData.size = size;
  return wrapper;
}

export function getModelSize(id) {
  const src = models.get(id);
  const box = new THREE.Box3().setFromObject(src);
  return box.getSize(new THREE.Vector3());
}
