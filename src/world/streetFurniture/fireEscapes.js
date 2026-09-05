import { east, north, south, west } from './faces.js';

export function placeFireEscapes(add, xs, zs) {
  const bottoms = [];
  const centers = [];
  const tops = [];
  const stacks = [
    east(xs[1], zs[0] + 30),
    east(xs[1], zs[1] + 30),
    east(xs[2], zs[1] + 30),
    west(xs[2], zs[2] + 30),
    north(zs[2], xs[0] + 30),
    south(zs[2], xs[2] + 30)
  ];
  for (const face of stacks) {
    const y0 = 3.32;
    bottoms.push({ ...face, y: y0 });
    let y = 6.4;
    for (let i = 0; i < 4; i++) {
      centers.push({ ...face, y });
      y += 3.07;
    }
    tops.push({ ...face, y });
  }
  add('fireB', bottoms);
  add('fireC', centers);
  add('fireT', tops);
}
