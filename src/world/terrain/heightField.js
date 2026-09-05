/**
 * Shared CPU height for open countryside.
 * Flush apron at the city (no curb shelf). Outside: White Orchard fan
 * heightmap when loaded, else procedural mid/ridge/peaks. River beds +
 * avenue grade still carve in heightAt().
 *
 * World extent scaled by √10 (~3.16× linear, ~10× area) vs legacy ±560 m.
 */

import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { cityBounds, isInsideCity } from '../RoadDimensions.js';
import {
  RIVERS,
  distToRiver,
  RIVER_HALF_WIDTH,
  RIVER_BLEND,
  RIVER_DEPTH,
  riverMountainHeight,
  riverPolyline,
  nearestOnRiver
} from '../water/rivers.js';
import { LAKES, lakeInside, ellipseRadius } from '../water/lakes.js';
import { biomeHillFactor, WORLD_LINEAR_SCALE } from './biomes.js';
import {
  bakeAvenueProfile,
  applyAvenueGrade,
  avenueTunnelCut
} from './countryAvenue.js';
import { whiteOrchardHeightAt } from './whiteOrchardHeight.js';

/** Fixed seed so every boot gets the same hills. */
export const TERRAIN_SEED = 42;

/** Exported for docs / HUD. */
export { WORLD_LINEAR_SCALE };

/**
 * Legacy knobs (tests / older callers). Layered heightAt no longer scales
 * a single amplitude band — prefer the distance layers below.
 */
let amplitudeMin = 0.15;
let amplitudeMax = 1.25;
let blendIn = 12;
let blendOut = 55;

export function setAmplitudeRange(min, max) {
  amplitudeMin = min;
  amplitudeMax = max;
}

export function setBlendRange(inner, outer) {
  blendIn = inner;
  blendOut = outer;
}

export function getAmplitudeRange() {
  return { min: amplitudeMin, max: amplitudeMax };
}

export function getBlendRange() {
  return { inner: blendIn, outer: blendOut };
}

const noise = new ImprovedNoise();
const seedOffset = TERRAIN_SEED * 0.137;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Distance outside the city AABB (0 on/inside the rect). */
export function distOutsideCity(x, z) {
  const b = cityBounds();
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
  return Math.hypot(dx, dz);
}

function n01(x, z, freq, ox = 0, oz = 0) {
  const n = noise.noise(x * freq + seedOffset + ox, seedOffset, z * freq + oz);
  return (n + 1) * 0.5;
}

/**
 * World Y of the countryside surface at (x, z) before river beds / avenue.
 * Distance bands scaled by WORLD_LINEAR_SCALE so the vista still reads on
 * the larger map.
 */
function uncarvedHeightAt(x, z) {
  if (isInsideCity(x, z)) return 0;

  const d = distOutsideCity(x, z);
  const S = WORLD_LINEAR_SCALE;

  // Keep the first ~12–55 m flush with streets (no shelf at the curb).
  const apron = smoothstep(blendIn, blendOut, d);
  if (apron <= 0) return 0;

  // White Orchard fan heightmap (~2 km): shape of the apron/campo.
  // Relative to curb so blend starts at Y≈0. Tiny micro-roll for grit only.
  const orch = whiteOrchardHeightAt(x, z);
  if (orch != null) {
    const micro = (n01(x, z, 0.05, 9.1, 2.2) - 0.5) * 0.12 * apron;
    return orch * apron + micro;
  }

  // Procedural fallback if the heightmap has not loaded yet.
  const roll = n01(x, z, 0.014) * 0.65 + n01(x, z, 0.038, 2.1, 1.3) * 0.35;
  const ridge = n01(x, z, 0.0045, 4.0, 0.7) * 0.7 + n01(x, z, 0.011, 1.2, 3.4) * 0.3;
  const peak = n01(x, z, 0.0019, 8.0, 2.2) * 0.75 + n01(x, z, 0.0055, 0.4, 6.1) * 0.25;

  const mid = smoothstep(45 * S, 170 * S, d);
  const rise = smoothstep(150 * S, 310 * S, d);
  const far = smoothstep(280 * S, 520 * S, d);

  let h = 0;
  h += (0.2 + roll * 2.0) * apron * (1 - mid * 0.55);
  h += (2.5 + roll * 11) * mid * (1 - rise * 0.4);
  h += (14 + ridge * 36) * rise * (1 - far * 0.3);
  h += (48 + peak * 100) * far;
  h += riverMountainHeight(x, z);
  const biomeF = biomeHillFactor(x, z);
  h += biomeF * (6 + roll * 10) * apron;

  return h;
}

const riverWaterYCache = new Map();
let avenueBaked = false;

function ensureAvenueBaked() {
  if (avenueBaked) return;
  avenueBaked = true;
  bakeAvenueProfile(uncarvedHeightAt);
}

/**
 * Sloping water Y along a river: high at source (tNorm~0), low at mouth (tNorm~1).
 * Uses uncarved samples with a monotone envelope so water clearly flows downhill.
 */
export function riverWaterYAt(river, tNorm) {
  const key = river.id;
  let profile = riverWaterYCache.get(key);
  if (!profile) {
    const line = riverPolyline(river);
    const samples = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      samples.push({
        t: p.tNorm ?? i / Math.max(1, line.length - 1),
        y: uncarvedHeightAt(p.x, p.z) - 0.45
      });
    }
    // Enforce monotone decrease source → mouth.
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].y > samples[i - 1].y - 0.02) {
        samples[i].y = samples[i - 1].y - 0.02;
      }
    }
    // Mouth should sit near a low basin.
    const mouth = samples[samples.length - 1];
    if (mouth) mouth.y = Math.min(mouth.y, 4);
    profile = samples;
    riverWaterYCache.set(key, profile);
  }
  if (!profile.length) return 0;
  const t = Math.min(1, Math.max(0, tNorm));
  for (let i = 0; i < profile.length - 1; i++) {
    if (t >= profile[i].t && t <= profile[i + 1].t) {
      const u =
        (t - profile[i].t) / Math.max(1e-6, profile[i + 1].t - profile[i].t);
      return profile[i].y * (1 - u) + profile[i + 1].y * u;
    }
  }
  return profile[profile.length - 1].y;
}

/**
 * Water plane Y: average along polyline (legacy flat callers).
 * Prefer riverWaterYAt for sloping ribbons.
 */
export function riverSurfaceY(river) {
  const line = riverPolyline(river);
  if (!line.length) return 0;
  const mid = line[Math.floor(line.length / 2)];
  return riverWaterYAt(river, mid.tNorm ?? 0.5);
}

/** @deprecated Prefer riverSurfaceY — kept for any stray lake callers. */
export function lakeSurfaceY(lake) {
  // Outfall lake sits at the main-stem mouth water level.
  const main = RIVERS[0];
  return riverWaterYAt(main, 1) + 0.15;
}

function applyLakeBasins(h, x, z) {
  let out = h;
  for (let i = 0; i < LAKES.length; i++) {
    const lake = LAKES[i];
    const t = ellipseRadius(x, z, lake);
    if (t >= 1.15) continue;
    const waterY = lakeSurfaceY(lake);
    const floor = waterY - (lake.depth ?? 2);
    const shore = smoothstep(0.85, 1.15, t);
    out = floor * (1 - shore) + out * shore;
  }
  return out;
}

/**
 * Carve smooth river beds: floor follows sloping waterY - depth.
 */
function applyRiverBeds(h, x, z) {
  let out = h;
  for (let i = 0; i < RIVERS.length; i++) {
    const river = RIVERS[i];
    const halfW = river.halfWidth ?? RIVER_HALF_WIDTH;
    const depth = river.depth ?? RIVER_DEPTH;
    const n = nearestOnRiver(x, z, river);
    const outer = halfW + RIVER_BLEND;
    if (n.dist >= outer) continue;
    const waterY = riverWaterYAt(river, n.tApprox);
    const floor = waterY - depth;
    let shore;
    if (n.dist <= halfW) {
      shore = 0;
    } else {
      shore = smoothstep(halfW, outer, n.dist);
    }
    out = floor * (1 - shore) + out * shore;
  }
  return out;
}

/**
 * World Y of the countryside surface at (x, z).
 * Inside the city: 0 (sidewalk). Outside: vista + biomes + rivers + avenue grade.
 */
export function heightAt(x, z) {
  ensureAvenueBaked();
  let h = uncarvedHeightAt(x, z);
  h = applyRiverBeds(h, x, z);
  h = applyLakeBasins(h, x, z);
  // Tunnel cut before avenue grade so the bore opens, then road fills the floor.
  h += avenueTunnelCut(x, z, h);
  h = applyAvenueGrade(h, x, z);
  return h;
}

/**
 * Approximate surface slope magnitude |grad height| via central differences.
 */
export function slopeAt(x, z) {
  const e = 1;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

/** Raw uncarved height for tools that must avoid feedback loops. */
export function rawHeightAt(x, z) {
  return uncarvedHeightAt(x, z);
}
