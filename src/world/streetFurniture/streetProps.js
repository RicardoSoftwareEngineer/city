import { GRID_STREET_COUNT } from '../RoadDimensions.js';
import { west } from './faces.js';

export function placeStreetProps(add, xs, zs) {
  const drains = [];
  const acs = [];
  const manholes = [];
  const bollards = [
    { x: 8.35, z: 18.4, rot: 0 },
    { x: 8.35, z: 21.6, rot: 0 }
  ];

  for (const sx of xs) {
    for (let j = 0; j < zs.length - 1; j++) {
      const z0 = zs[j] + 18;
      const z1 = zs[j + 1] - 18;
      for (let z = z0; z <= z1 + 0.01; z += 18) {
        drains.push({ x: sx - 6.15, z, y: -0.15 });
        drains.push({ x: sx + 6.15, z, y: -0.15 });
      }
    }
  }

  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      if (i > 0 && j > 0) {
        manholes.push({ x: xs[i] + 2.2, z: zs[j] - 2.2, y: -0.148 });
      }
    }
  }

  for (let i = 0; i < GRID_STREET_COUNT - 1; i++) {
    for (let j = 0; j < GRID_STREET_COUNT - 1; j++) {
      if (i === 0 && j === 0) continue;
      const face = west(xs[i], (zs[j] + zs[j + 1]) / 2);
      acs.push({ x: face.x + 2.4, y: 16.2, z: face.z, rot: face.rot });
      acs.push({ x: face.x + 2.4, y: 16.2, z: face.z + 6, rot: face.rot });
    }
  }

  add('drain', drains);
  add('manhole', manholes);
  add('bollard', bollards);
  add('ac', acs);
}
