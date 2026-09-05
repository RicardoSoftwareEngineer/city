/**
 * White Orchard fan heightmap (Til-Weimann / witcher3-heightmaps).
 * Elevation only — no CDPR meshes/textures. Sampled outside the city AABB;
 * apron blend in heightField keeps curb flush (no shelf).
 *
 * Data: public/terrain/whiteOrchard_h2048.bin (float32 meters, row-major)
 * + whiteOrchard_h2048.json meta. 4096² 16-bit PNG downsampled offline so the
 * browser never loses precision via 8-bit canvas.
 */

import { CITY_PAVED_MIN, CITY_PAVED_MAX } from '../RoadDimensions.js';

const BIN_URL = '/terrain/whiteOrchard_h2048.bin';
const META_URL = '/terrain/whiteOrchard_h2048.json';

/** Paved city centre — heightmap UV origin. */
const ORIGIN_X = (CITY_PAVED_MIN + CITY_PAVED_MAX) * 0.5;
const ORIGIN_Z = (CITY_PAVED_MIN + CITY_PAVED_MAX) * 0.5;

let grid = null;
let size = 0;
let mapMeters = 2000;
let ready = false;
let loading = null;
let curbHeight = 0;

export function isWhiteOrchardReady() {
  return ready;
}

export function whiteOrchardOrigin() {
  return { x: ORIGIN_X, z: ORIGIN_Z, mapMeters };
}

/**
 * Fetch + decode once before terrain mesh/phys sample. Safe to call many times.
 * @returns {Promise<boolean>}
 */
export function ensureWhiteOrchardHeightmap() {
  if (ready) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async () => {
    const [metaRes, binRes] = await Promise.all([fetch(META_URL), fetch(BIN_URL)]);
    if (!metaRes.ok || !binRes.ok) {
      throw new Error(`orchard heightmap HTTP ${metaRes.status}/${binRes.status}`);
    }
    const meta = await metaRes.json();
    size = meta.size | 0;
    mapMeters = Number(meta.mapMeters) || 2000;
    const buf = await binRes.arrayBuffer();
    grid = new Float32Array(buf);
    if (grid.length !== size * size) {
      throw new Error(`orchard bin length ${grid.length} != ${size * size}`);
    }
    curbHeight = sampleRaw(ORIGIN_X, ORIGIN_Z);
    ready = true;
    console.log(
      `[terrain] White Orchard heightmap ${size}² · ${mapMeters}m · curb ${curbHeight.toFixed(2)}m`
    );
    return true;
  })().catch((err) => {
    console.error('[terrain] White Orchard heightmap failed — procedural fallback', err);
    loading = null;
    ready = false;
    grid = null;
    return false;
  });
  return loading;
}

function sampleRaw(x, z) {
  if (!grid || size < 2) return 0;
  const u = Math.min(1, Math.max(0, (x - ORIGIN_X) / mapMeters + 0.5));
  const v = Math.min(1, Math.max(0, (z - ORIGIN_Z) / mapMeters + 0.5));
  const fx = u * (size - 1);
  const fz = v * (size - 1);
  const x0 = fx | 0;
  const z0 = fz | 0;
  const x1 = Math.min(size - 1, x0 + 1);
  const z1 = Math.min(size - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const i00 = z0 * size + x0;
  const i10 = z0 * size + x1;
  const i01 = z1 * size + x0;
  const i11 = z1 * size + x1;
  const h0 = grid[i00] * (1 - tx) + grid[i10] * tx;
  const h1 = grid[i01] * (1 - tx) + grid[i11] * tx;
  return h0 * (1 - tz) + h1 * tz;
}

/**
 * Height relative to paved-city curb (so apron can fade from 0 with no shelf).
 * Returns null if the map is not loaded yet (caller keeps procedural).
 */
export function whiteOrchardHeightAt(x, z) {
  if (!ready) return null;
  return sampleRaw(x, z) - curbHeight;
}
