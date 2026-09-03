/**
 * Official Three.js Water2.js lake (reflection + refraction + dual-normal flow).
 * Matches the Water2 addon contract: two official normal maps, flowDirection
 * (no flowMap), reflectivity 0.02, scale 4, 1024 reflection/refraction targets.
 * Animation is internal (Timer in onBeforeRender) — do not tick it yourself.
 *
 * @see three/addons/objects/Water2.js
 */

import * as THREE from 'three';
import { Water as Water2 } from 'three/addons/objects/Water2.js';

const NORMAL_0 = '/textures/water/Water_1_M_Normal.jpg';
const NORMAL_1 = '/textures/water/Water_2_M_Normal.jpg';

/**
 * @param {typeof import('./lakes.js').LAKE_WATER2} lake
 * @param {{ waterY: number }} opts
 */
export function createWater2Lake(lake, opts) {
  const loader = new THREE.TextureLoader();
  const normalMap0 = loader.load(NORMAL_0);
  const normalMap1 = loader.load(NORMAL_1);
  normalMap0.wrapS = normalMap0.wrapT = THREE.RepeatWrapping;
  normalMap1.wrapS = normalMap1.wrapT = THREE.RepeatWrapping;

  const geometry = new THREE.CircleGeometry(1, lake.segments);
  const water = new Water2(geometry, {
    color: 0xffffff,
    textureWidth: 1024,
    textureHeight: 1024,
    flowDirection: new THREE.Vector2(1, 1),
    flowSpeed: 0.03,
    reflectivity: 0.02,
    scale: 4,
    normalMap0,
    normalMap1
  });

  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.cx, opts.waterY, lake.cz);
  water.scale.set(lake.rx, lake.rz, 1);
  water.castShadow = false;
  water.receiveShadow = false;
  water.name = 'lake_Water2.js';
  water.userData.lakeId = lake.id;
  return water;
}
