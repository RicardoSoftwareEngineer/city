/**
 * Terrain colliders, decoupled from the visual stream.
 *
 * The countryside mesh streams in rings, but the car must never outrun its
 * ground: driving past the streamed radius used to mean falling through the
 * world. This module owns one Cannon Heightfield per tile, keyed by grid, and
 * can build a tile on demand (cheap CPU work, no GPU) around the car.
 *
 * Same grid as TerrainWorld: fine 40 m tiles inside TERRAIN_NEAR_HALF,
 * coarse 80 m tiles out to GROUND_BODY_HALF.
 */

import * as CANNON from 'cannon-es';
import { GROUND_BODY_HALF, isInsideCity } from '../RoadDimensions.js';
import { surfaceY } from './paths.js';

export const TERRAIN_TILE = 40;
export const TERRAIN_TILE_FAR = 80;
export const TERRAIN_NEAR_HALF = 320;

const NEAR_SEGS = 20;
const FAR_SEGS = 10;

/** -PI/2 on X so Heightfield local Z (height) becomes world Y. */
const HF_QUAT = new CANNON.Quaternion();
HF_QUAT.setFromEuler(-Math.PI / 2, 0, 0);

/** tileKey -> CANNON.Body */
const bodies = new Map();
let physics = null;

export function setTerrainPhysics(physicsWorld) {
  physics = physicsWorld;
}

function nearOnly(x0, z0, size) {
  const h = TERRAIN_NEAR_HALF;
  return x0 >= -h && x0 + size <= h && z0 >= -h && z0 + size <= h;
}

function snap(value, size) {
  return Math.floor(value / size) * size;
}

/** Tile descriptor for a world position, or null outside the playable square. */
export function tileAt(x, z) {
  if (Math.abs(x) > GROUND_BODY_HALF || Math.abs(z) > GROUND_BODY_HALF) return null;

  const near = Math.abs(x) < TERRAIN_NEAR_HALF && Math.abs(z) < TERRAIN_NEAR_HALF;
  const size = near ? TERRAIN_TILE : TERRAIN_TILE_FAR;
  const segs = near ? NEAR_SEGS : FAR_SEGS;
  const x0 = snap(x, size);
  const z0 = snap(z, size);

  // A coarse tile fully inside the fine ring belongs to the fine grid.
  if (!near && nearOnly(x0, z0, size)) return null;

  const cx = x0 + size * 0.5;
  const cz = z0 + size * 0.5;
  if (isInsideCity(cx, cz)) return null;

  return { key: `${size}:${x0}:${z0}`, x0, z0, size, segs, cx, cz, far: !near };
}

/** Enumerate every tile, in the same order/rules TerrainWorld draws them. */
export function allTiles() {
  const out = [];
  const seen = new Set();
  const push = (x0, z0, size, segs, far) => {
    const cx = x0 + size * 0.5;
    const cz = z0 + size * 0.5;
    if (isInsideCity(cx, cz)) return;
    const key = `${size}:${x0}:${z0}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, x0, z0, size, segs, cx, cz, far });
  };

  for (let x0 = -TERRAIN_NEAR_HALF; x0 < TERRAIN_NEAR_HALF; x0 += TERRAIN_TILE) {
    for (let z0 = -TERRAIN_NEAR_HALF; z0 < TERRAIN_NEAR_HALF; z0 += TERRAIN_TILE) {
      push(x0, z0, TERRAIN_TILE, NEAR_SEGS, false);
    }
  }
  for (let x0 = -GROUND_BODY_HALF; x0 < GROUND_BODY_HALF; x0 += TERRAIN_TILE_FAR) {
    for (let z0 = -GROUND_BODY_HALF; z0 < GROUND_BODY_HALF; z0 += TERRAIN_TILE_FAR) {
      if (nearOnly(x0, z0, TERRAIN_TILE_FAR)) continue;
      push(x0, z0, TERRAIN_TILE_FAR, FAR_SEGS, true);
    }
  }
  return out;
}

function buildBody(tile) {
  const n = tile.segs + 1;
  const elementSize = tile.size / tile.segs;
  const matrix = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const wx = tile.x0 + i * elementSize;
      const wz = tile.z0 + (n - 1 - j) * elementSize;
      row.push(surfaceY(wx, wz));
    }
    matrix.push(row);
  }
  const position = new CANNON.Vec3(tile.x0, 0, tile.z0 + tile.size);
  return physics.addHeightfield(matrix, elementSize, position, HF_QUAT);
}

/** Build this tile's collider if it does not exist yet. Returns true if built. */
export function ensureTile(tile) {
  if (!physics || !tile || bodies.has(tile.key)) return false;
  bodies.set(tile.key, buildBody(tile));
  return true;
}

export function hasTile(tile) {
  return Boolean(tile) && bodies.has(tile.key);
}

/**
 * Guarantee ground under and just around a world position.
 * Called every frame with the car pose — builds at most `maxBuilds` tiles per
 * call so a fast car never outruns its collider without stalling a frame.
 */
export function ensureGroundAround(x, z, radius = 60, maxBuilds = 2) {
  if (!physics) return 0;
  let built = 0;
  const step = TERRAIN_TILE * 0.5;
  for (let dx = -radius; dx <= radius && built < maxBuilds; dx += step) {
    for (let dz = -radius; dz <= radius && built < maxBuilds; dz += step) {
      const tile = tileAt(x + dx, z + dz);
      if (!tile || bodies.has(tile.key)) continue;
      ensureTile(tile);
      built += 1;
    }
  }
  return built;
}

export function terrainBodyCount() {
  return bodies.size;
}
