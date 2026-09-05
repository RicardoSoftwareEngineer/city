import { GRID_STREET_COUNT } from '../RoadDimensions.js';

export function placeStairs(add, xs, zs) {
  const concrete = [];
  const marble = [];
  for (let i = 0; i < GRID_STREET_COUNT; i++) {
    for (let j = 0; j < GRID_STREET_COUNT - 1; j++) {
      if (i === 0 && j === 0) continue;
      const z = (zs[j] + zs[j + 1]) / 2;
      const useMarble = (i + j) % 3 === 0;
      const bucket = useMarble ? marble : concrete;
      if (i < GRID_STREET_COUNT - 1) {
        bucket.push({ x: xs[i] + 8.5, z, rot: -Math.PI / 2 });
      }
      if (i > 0) {
        bucket.push({ x: xs[i] - 8.5, z, rot: Math.PI / 2 });
      }
    }
  }

  add('stairsConcrete', concrete);
  add('railsConcrete', concrete);

  add('stairsMarble', marble);
  add('railsMarble', marble);
}
