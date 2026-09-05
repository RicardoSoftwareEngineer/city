import { SIDEWALK_EDGE } from '../RoadDimensions.js';

const WALL = SIDEWALK_EDGE + 0.08;

export function west(sx, z) {
  return { x: sx + WALL, z, rot: -Math.PI / 2 };
}

export function east(sx, z) {
  return { x: sx - WALL, z, rot: Math.PI / 2 };
}

export function south(sz, x) {
  return { x, z: sz + WALL, rot: Math.PI };
}

export function north(sz, x) {
  return { x, z: sz - WALL, rot: 0 };
}
