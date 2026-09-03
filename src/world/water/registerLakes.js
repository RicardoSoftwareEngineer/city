/**
 * Stream the two official water addons as separate lakes.
 * Water.js needs a per-frame time/sun tick. Water2.js ticks itself.
 */

import * as THREE from 'three';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { lakeSurfaceY } from '../terrain/heightField.js';
import { LAKE_WATER, LAKE_WATER2 } from './lakes.js';
import { createWaterLake, tickWaterLake } from './waterLake.js';
import { createWater2Lake } from './water2Lake.js';

let waterLake = null;
const sunDirection = new THREE.Vector3(0.70707, 0.70707, 0);
let sunLight = null;

function findSun(scene) {
  let found = null;
  scene.traverse((obj) => {
    if (obj.isDirectionalLight) found = obj;
  });
  return found;
}

function updateSunDirection(scene) {
  if (!sunLight || !sunLight.parent) {
    sunLight = scene ? findSun(scene) : sunLight;
  }
  if (!sunLight) return;
  sunDirection.copy(sunLight.position);
  if (sunLight.target) sunDirection.sub(sunLight.target.position);
  sunDirection.normalize();
}

export function registerLakes(stream, parentGroup, ox, oz, scene) {
  stream.addTask({
    dist: chebyshev(LAKE_WATER.cx, LAKE_WATER.cz, ox, oz),
    priority: 4,
    run: async () => {
      beginLoad('water', 'Water.js lake');
      updateSunDirection(scene);
      const mesh = createWaterLake(LAKE_WATER, {
        waterY: lakeSurfaceY(LAKE_WATER),
        sunDirection,
        fog: Boolean(scene?.fog)
      });
      parentGroup.add(mesh);
      waterLake = mesh;
    }
  });

  stream.addTask({
    dist: chebyshev(LAKE_WATER2.cx, LAKE_WATER2.cz, ox, oz),
    priority: 4,
    run: async () => {
      beginLoad('water', 'Water2.js lake');
      const mesh = createWater2Lake(LAKE_WATER2, {
        waterY: lakeSurfaceY(LAKE_WATER2)
      });
      parentGroup.add(mesh);
    }
  });
}

/** Call from GameLoop. Water2 animates inside onBeforeRender. */
export function tickWater(elapsedSeconds, scene) {
  if (scene) updateSunDirection(scene);
  tickWaterLake(waterLake, elapsedSeconds, sunDirection);
}
