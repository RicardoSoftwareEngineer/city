/**
 * Official Three.js Water2.js river ribbon (reflection + refraction + flow).
 * Same normals/settings as water2Lake.js; flowDirection from river tangent.
 *
 * @see three/addons/objects/Water2.js
 */

import * as THREE from 'three';
import { Water as Water2 } from 'three/addons/objects/Water2.js';
import {
  buildRiverRibbonGeometry,
  approxFlowDirection
} from './riverGeometry.js';

const NORMAL_0 = '/textures/water/Water_1_M_Normal.jpg';
const NORMAL_1 = '/textures/water/Water_2_M_Normal.jpg';

/**
 * @param {typeof import('./rivers.js').RIVER_WATER2} river
 * @param {{ waterY: number }} opts
 */
export function createWater2River(river, opts) {
  const loader = new THREE.TextureLoader();
  const normalMap0 = loader.load(NORMAL_0);
  const normalMap1 = loader.load(NORMAL_1);
  normalMap0.wrapS = normalMap0.wrapT = THREE.RepeatWrapping;
  normalMap1.wrapS = normalMap1.wrapT = THREE.RepeatWrapping;

  const geometry = buildRiverRibbonGeometry(river);
  const flowDirection = approxFlowDirection(river);

  const water = new Water2(geometry, {
    color: 0xffffff,
    textureWidth: 1024,
    textureHeight: 1024,
    flowDirection,
    flowSpeed: 0.03,
    reflectivity: 0.02,
    scale: 4,
    normalMap0,
    normalMap1
  });

  water.rotation.x = -Math.PI / 2;
  water.position.set(0, opts.waterY, 0);
  water.castShadow = false;
  water.receiveShadow = false;
  water.name = 'river_Water2.js';
  water.userData.riverId = river.id;
  return water;
}
