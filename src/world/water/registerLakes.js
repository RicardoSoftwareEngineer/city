/**
 * Stream the two official water addons as parallel S-rivers east of the city.
 * Water.js needs a per-frame time/sun tick. Water2.js ticks itself.
 * Export names kept (registerLakes / tickWater) so main.js stays unchanged.
 */

import * as THREE from 'three';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { riverSurfaceY } from '../terrain/heightField.js';
import {
  RIVER_WATER,
  RIVER_WATER2,
  riverCorridorCenter
} from './rivers.js';
import { createWaterRiver, tickWaterRiver } from './waterRiver.js';
import { createWater2River } from './water2River.js';

let waterRiver = null;
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
  const center = riverCorridorCenter();
  const dist = chebyshev(center.x, center.z, ox, oz);

  stream.addTask({
    dist,
    priority: 4,
    run: async () => {
      beginLoad('water', 'Water.js river');
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
    run: async () => {
      beginLoad('water', 'Water2.js river');
      const mesh = createWater2River(RIVER_WATER2, {
        waterY: riverSurfaceY(RIVER_WATER2)
      });
      parentGroup.add(mesh);
    }
  });
}

/** Call from GameLoop. Water2 animates inside onBeforeRender. */
export function tickWater(elapsedSeconds, scene) {
  if (scene) updateSunDirection(scene);
  tickWaterRiver(waterRiver, elapsedSeconds, sunDirection);
}
