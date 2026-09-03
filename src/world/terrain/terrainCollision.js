/**
 * Terrain colliders + the tile grid shared with the visual terrain.
 *
 * Two rules keep the ground hole-free:
 *  1. Grid lines are OFFSET so the paved city rect and the near/far seam land
 *     exactly on tile borders. No tile ever straddles them, so skipping a tile
 *     can never leave a half-tile band with no ground — that band, on the west
 *     and south edges of the city, is where the car used to fall through.
 *  2. Colliders are decoupled from the visual stream: ensureGroundAround()
 *     builds the Heightfield under the car on demand (cheap CPU, no GPU), so
 *     driving past the streamed ring is safe.
 *
 * Fine 40 m tiles inside the near rect, coarse 80 m tiles out to the fence.
 */

import * as CANNON from 'cannon-es';
import { CITY_PAVED_MIN, CITY_PAVED_MAX } from '../RoadDimensions.js';
import { surfaceY } from './paths.js';

export const TERRAIN_TILE = 40;
export const TERRAIN_TILE_FAR = 80;

/** Both grids share this offset; 40 m and 80 m lines both fall on it. */
export const GRID_OFFSET = -10;

/** Paved city rect (RoadDimensions): exactly 5x5 fine tiles. */
export const PAVED_MIN = CITY_PAVED_MIN;
export const PAVED_MAX = CITY_PAVED_MAX;

/**
 * Tiles are dropped only when fully inside the paved rect shrunk by one tile,
 * so the border ring still runs one tile INTO the city and tucks under the
 * asphalt (surfaceY buries it). That leaves no crack at the curb.
 */
const SKIP_MIN = PAVED_MIN + TERRAIN_TILE;
const SKIP_MAX = PAVED_MAX - TERRAIN_TILE;

/** Near rect: 8 fine tiles each way (320 m), also a multiple of 80 m. */
const NEAR_TILES = 8;
export const TERRAIN_NEAR_HALF = NEAR_TILES * TERRAIN_TILE;
export const NEAR_MIN = GRID_OFFSET - TERRAIN_NEAR_HALF;
export const NEAR_MAX = GRID_OFFSET + TERRAIN_NEAR_HALF;

/** Far rect: covers the +-560 m fence on the same offset grid. */
const FAR_FIRST_K = -7;
const FAR_LAST_K = 7;
export const FAR_MIN = GRID_OFFSET + FAR_FIRST_K * TERRAIN_TILE_FAR;
export const FAR_MAX = GRID_OFFSET + (FAR_LAST_K + 1) * TERRAIN_TILE_FAR;

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

function fullyInside(x0, z0, size, min, max) {
  return x0 >= min && x0 + size <= max && z0 >= min && z0 + size <= max;
}

function snap(value, size) {
  return GRID_OFFSET + Math.floor((value - GRID_OFFSET) / size) * size;
}

function describe(x0, z0, size) {
  const near = size === TERRAIN_TILE;
  return {
    key: `${size}:${x0}:${z0}`,
    x0,
    z0,
    size,
    segs: near ? NEAR_SEGS : FAR_SEGS,
    cx: x0 + size * 0.5,
    cz: z0 + size * 0.5,
    far: !near
  };
}

/** Tile descriptor for a world position, or null where the city floor owns it. */
export function tileAt(x, z) {
  if (x < FAR_MIN || x >= FAR_MAX || z < FAR_MIN || z >= FAR_MAX) return null;

  const near = x >= NEAR_MIN && x < NEAR_MAX && z >= NEAR_MIN && z < NEAR_MAX;
  const size = near ? TERRAIN_TILE : TERRAIN_TILE_FAR;
  const x0 = snap(x, size);
  const z0 = snap(z, size);

  // The paved city core already has its flat asphalt box under it.
  if (near && fullyInside(x0, z0, size, SKIP_MIN, SKIP_MAX)) return null;

  return describe(x0, z0, size);
}

/** Every tile, in the same order/rules TerrainWorld draws them. */
export function allTiles() {
  const out = [];

  for (let x0 = NEAR_MIN; x0 < NEAR_MAX; x0 += TERRAIN_TILE) {
    for (let z0 = NEAR_MIN; z0 < NEAR_MAX; z0 += TERRAIN_TILE) {
      if (fullyInside(x0, z0, TERRAIN_TILE, SKIP_MIN, SKIP_MAX)) continue;
      out.push(describe(x0, z0, TERRAIN_TILE));
    }
  }
  for (let x0 = FAR_MIN; x0 < FAR_MAX; x0 += TERRAIN_TILE_FAR) {
    for (let z0 = FAR_MIN; z0 < FAR_MAX; z0 += TERRAIN_TILE_FAR) {
      if (fullyInside(x0, z0, TERRAIN_TILE_FAR, NEAR_MIN, NEAR_MAX)) continue;
      out.push(describe(x0, z0, TERRAIN_TILE_FAR));
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

/** Tiles that currently have a collider (debug overlay). */
export function builtTiles() {
  const out = [];
  for (const key of bodies.keys()) {
    const [size, x0, z0] = key.split(':').map(Number);
    out.push(describe(x0, z0, size));
  }
  return out;
}
