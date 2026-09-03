/**
 * Official Three.js Water.js river ribbon (reflective, sun-lit, animated normals).
 * Same textures/settings as waterLake.js; geometry from buildRiverRibbonGeometry.
 *
 * @see three/addons/objects/Water.js
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { buildRiverRibbonGeometry } from './riverGeometry.js';

const WATER_NORMALS_URL = '/textures/waternormals.jpg';

/**
 * @param {typeof import('./rivers.js').RIVER_WATER} river
 * @param {{ waterY: number, sunDirection: THREE.Vector3, fog: boolean }} opts
 */
export function createWaterRiver(river, opts) {
  const loader = new THREE.TextureLoader();
  const waterNormals = loader.load(WATER_NORMALS_URL, (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  const geometry = buildRiverRibbonGeometry(river);
  const water = new Water(geometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals,
    sunDirection: opts.sunDirection.clone().normalize(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: opts.fog === true,
    alpha: 1.0
  });

  // Geometry is local XY; rotate to XZ so Water mirror normal (+Z local) → +Y world.
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, opts.waterY, 0);
  water.castShadow = false;
  water.receiveShadow = false;
  water.name = 'river_Water.js';
  water.userData.riverId = river.id;
  return water;
}

/** Official example advances the time uniform every frame. */
export function tickWaterRiver(water, elapsedSeconds, sunDirection) {
  if (!water?.material?.uniforms) return;
  water.material.uniforms.time.value = elapsedSeconds;
  if (sunDirection && water.material.uniforms.sunDirection) {
    water.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
  }
}
