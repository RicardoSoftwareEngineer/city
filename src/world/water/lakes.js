/**
 * Two demo lakes for the official Three.js water addons.
 * Layout only — Water.js / Water2.js stay in their own modules.
 *
 * water  — larger still body (Water.js was designed as a reflective lake/ocean plane)
 * water2 — smaller flowing pool (Water2.js was designed for flow + reflection + refraction)
 */

export const LAKE_WATER = {
  id: 'water',
  kind: 'water',
  cx: 258,
  cz: 46,
  rx: 56,
  rz: 40,
  depth: 2.4,
  segments: 96
};

export const LAKE_WATER2 = {
  id: 'water2',
  kind: 'water2',
  cx: 38,
  cz: -88,
  rx: 26,
  rz: 20,
  depth: 1.8,
  segments: 80
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
