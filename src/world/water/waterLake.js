/**
 * Official Three.js Water.js lake (reflective, sun-lit, animated normals).
 * Matches examples/webgl_water: Plane/disk, waternormals.jpg, sunColor white,
 * waterColor 0x001e0f, distortionScale 3.7, time uniform, rotation.x = -PI/2.
 *
 * @see three/addons/objects/Water.js
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

const WATER_NORMALS_URL = '/textures/waternormals.jpg';

/**
 * @param {typeof import('./lakes.js').LAKE_WATER} lake
 * @param {{ waterY: number, sunDirection: THREE.Vector3, fog: boolean }} opts
 */
export function createWaterLake(lake, opts) {
  const loader = new THREE.TextureLoader();
  const waterNormals = loader.load(WATER_NORMALS_URL, (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  const geometry = new THREE.CircleGeometry(1, lake.segments);
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

  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.cx, opts.waterY, lake.cz);
  water.scale.set(lake.rx, lake.rz, 1);
  water.castShadow = false;
  water.receiveShadow = false;
  water.name = 'lake_Water.js';
  water.userData.lakeId = lake.id;
  return water;
}

/** Official example advances the time uniform every frame. */
export function tickWaterLake(water, elapsedSeconds, sunDirection) {
  if (!water?.material?.uniforms) return;
  water.material.uniforms.time.value = elapsedSeconds;
  if (sunDirection && water.material.uniforms.sunDirection) {
    water.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
  }
}
