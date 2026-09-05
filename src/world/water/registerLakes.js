/**
 * Stream watershed rivers + outfall lake.
 * Water.js needs a per-frame time/sun tick. Water2.js ticks itself.
 * Export names kept (registerLakes / tickWater) so main.js stays unchanged.
 */

import * as THREE from 'three';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { lakeSurfaceY, riverSurfaceY } from '../terrain/heightField.js';
import {
  RIVER_WATER,
  RIVER_WATER2
} from './rivers.js';
import { LAKE_WATER } from './lakes.js';
import { createWaterRiver, tickWaterRiver } from './waterRiver.js';
import { createWater2River } from './water2River.js';
import { createWaterLake, tickWaterLake } from './waterLake.js';

let waterRiver = null;
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
  // Near-city east sample so the main ribbon streams with the first countryside rings.
  const center = { x: 520, z: 120 };
  const dist = chebyshev(center.x, center.z, ox, oz);
  const lakeDist = chebyshev(LAKE_WATER.cx, LAKE_WATER.cz, ox, oz);

  stream.addTask({
    dist,
    priority: 4,
    x: center.x,
    z: center.z,
    run: async () => {
      beginLoad('water', 'Water.js main river');
      updateSunDirection(scene);
      const mesh = createWaterRiver(RIVER_WATER, {
        waterY: riverSurfaceY(RIVER_WATER),
        sunDirection,
        fog: Boolean(scene?.fog)
      });
      parentGroup.add(mesh);
      waterRiver = mesh;
    }
  });

  stream.addTask({
    dist,
    priority: 4,
    x: center.x,
    z: center.z,
    run: async () => {
      beginLoad('water', 'Water2.js tributary');
      const mesh = createWater2River(RIVER_WATER2, {
        waterY: riverSurfaceY(RIVER_WATER2)
      });
      parentGroup.add(mesh);
    }
  });

  stream.addTask({
    dist: lakeDist,
    priority: 4,
    x: LAKE_WATER.cx,
    z: LAKE_WATER.cz,
    run: async () => {
      beginLoad('water', 'outfall lake');
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
}

/** Call from GameLoop. Water2 animates inside onBeforeRender. */
export function tickWater(elapsedSeconds, scene) {
  if (scene) updateSunDirection(scene);
  tickWaterRiver(waterRiver, elapsedSeconds, sunDirection);
  tickWaterLake(waterLake, elapsedSeconds, sunDirection);
}
