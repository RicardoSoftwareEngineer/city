/**
 * Outfall lake at the river mouth (lakeshore biome) + a small wetland pool.
 * Layout only — Water.js / Water2.js stay in their own modules when used as lakes.
 */

export const LAKE_WATER = {
  id: 'outfall-lake',
  kind: 'water',
  cx: 220,
  cz: -1140,
  rx: 90,
  rz: 70,
  depth: 3.2,
  segments: 96
};

export const LAKE_WATER2 = {
  id: 'wetland-pool',
  kind: 'water2',
  cx: -160,
  cz: -760,
  rx: 42,
  rz: 32,
  depth: 1.6,
  segments: 72
};

export const LAKES = [LAKE_WATER, LAKE_WATER2];

function ellipseT(x, z, lake) {
  const dx = (x - lake.cx) / lake.rx;
  const dz = (z - lake.cz) / lake.rz;
  return Math.hypot(dx, dz);
}

/** 0 outside, 1 deep inside the ellipse. */
export function lakeInside(x, z, lake, pad = 0) {
  const rx = lake.rx + pad;
  const rz = lake.rz + pad;
  const dx = (x - lake.cx) / rx;
  const dz = (z - lake.cz) / rz;
  return Math.hypot(dx, dz) <= 1;
}

export function isInAnyLake(x, z, pad = 1.5) {
  for (let i = 0; i < LAKES.length; i++) {
    if (lakeInside(x, z, LAKES[i], pad)) return true;
  }
  return false;
}

export function ellipseRadius(x, z, lake) {
  return ellipseT(x, z, lake);
}
