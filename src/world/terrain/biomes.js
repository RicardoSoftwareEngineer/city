/**
 * Named countryside biomes for the expanded Witcher-style open map.
 * Soft distance fields (not hard Voronoi walls) so splat/veg blend at edges.
 *
 * Scale note: world linear factor is √10 (~3.16×) vs the old ±560 m fence —
 * area ~10× — dramatic enough for 3 load-radius rings without flooding the
 * stream task table (a literal linear×10 would explode far-tile counts).
 */

import { cityBounds, isInsideCity } from '../RoadDimensions.js';

/** Documented scale choice for this expansion. */
export const WORLD_LINEAR_SCALE = Math.sqrt(10);
export const WORLD_SCALE_NOTE =
  'linear ≈√10 (~3.16×), area ~10×; prefer dramatic feel without breaking streaming';

function distOutsideCityLocal(x, z) {
  const b = cityBounds();
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
  return Math.hypot(dx, dz);
}

/**
 * Biome definitions. Centers are in world XZ meters (city 4×4 stays near origin).
 * radius = soft core; blend = meters of falloff beyond radius.
 */
export const BIOMES = [
  {
    id: 'meadow',
    name: 'Meadow Hills',
    cx: 420,
    cz: 140,
    radius: 280,
    blend: 160,
    grass: [0.32, 0.52, 0.28],
    dirt: [0.55, 0.45, 0.32],
    rock: [0.42, 0.4, 0.38],
    hillBoost: 0.35,
    vegDensity: 1.15,
    treeBias: 0.4,
    rockBias: 0.15,
    wetland: 0
  },
  {
    id: 'forest',
    name: 'Deep Forest',
    cx: -720,
    cz: 520,
    radius: 340,
    blend: 180,
    grass: [0.18, 0.38, 0.2],
    dirt: [0.35, 0.28, 0.18],
    rock: [0.3, 0.3, 0.28],
    hillBoost: 0.55,
    vegDensity: 1.45,
    treeBias: 1.4,
    rockBias: 0.25,
    wetland: 0
  },
  {
    id: 'wetland',
    name: 'Wetland Marsh',
    cx: -180,
    cz: -780,
    radius: 300,
    blend: 170,
    grass: [0.28, 0.42, 0.3],
    dirt: [0.4, 0.38, 0.28],
    rock: [0.35, 0.36, 0.32],
    hillBoost: -0.25,
    vegDensity: 1.25,
    treeBias: 0.25,
    rockBias: 0.05,
    wetland: 1
  },
  {
    id: 'lakeshore',
    name: 'Lakeshore',
    cx: 220,
    cz: -1100,
    radius: 260,
    blend: 140,
    grass: [0.35, 0.48, 0.32],
    dirt: [0.5, 0.42, 0.3],
    rock: [0.45, 0.44, 0.4],
    hillBoost: -0.15,
    vegDensity: 0.95,
    treeBias: 0.55,
    rockBias: 0.2,
    wetland: 0.45
  },
  {
    id: 'rocky',
    name: 'Rocky Foothills',
    cx: 820,
    cz: -420,
    radius: 320,
    blend: 170,
    grass: [0.4, 0.42, 0.3],
    dirt: [0.48, 0.4, 0.32],
    rock: [0.5, 0.48, 0.45],
    hillBoost: 0.85,
    vegDensity: 0.7,
    treeBias: 0.2,
    rockBias: 1.35,
    wetland: 0
  },
  {
    id: 'ridge',
    name: 'Mountain Ridge',
    cx: 980,
    cz: 980,
    radius: 380,
    blend: 220,
    grass: [0.3, 0.36, 0.28],
    dirt: [0.4, 0.35, 0.28],
    rock: [0.55, 0.54, 0.52],
    hillBoost: 1.4,
    vegDensity: 0.45,
    treeBias: 0.35,
    rockBias: 1.5,
    wetland: 0
  },
  {
    id: 'highland',
    name: 'Highland Source',
    cx: 1320,
    cz: 1480,
    radius: 300,
    blend: 200,
    grass: [0.34, 0.4, 0.3],
    dirt: [0.42, 0.36, 0.28],
    rock: [0.58, 0.56, 0.54],
    hillBoost: 1.7,
    vegDensity: 0.35,
    treeBias: 0.15,
    rockBias: 1.2,
    wetland: 0
  },
  {
    id: 'pasture',
    name: 'Open Pasture',
    cx: -900,
    cz: -200,
    radius: 300,
    blend: 160,
    grass: [0.42, 0.55, 0.28],
    dirt: [0.58, 0.48, 0.3],
    rock: [0.4, 0.38, 0.35],
    hillBoost: 0.15,
    vegDensity: 1.05,
    treeBias: 0.15,
    rockBias: 0.1,
    wetland: 0
  }
];

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Weight of a biome at (x,z): 1 in core, 0 outside blend. */
export function biomeWeight(biome, x, z) {
  const d = Math.hypot(x - biome.cx, z - biome.cz);
  if (d <= biome.radius) return 1;
  const outer = biome.radius + biome.blend;
  if (d >= outer) return 0;
  return 1 - smoothstep(biome.radius, outer, d);
}

/**
 * Blended biome influence at a point.
 */
export function biomeInfluence(x, z) {
  const weights = new Array(BIOMES.length);
  let total = 0;
  let best = 0;
  let dominant = null;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = biomeWeight(BIOMES[i], x, z);
    weights[i] = w;
    total += w;
    if (w > best) {
      best = w;
      dominant = BIOMES[i];
    }
  }
  if (total < 0.15 && !isInsideCity(x, z) && distOutsideCityLocal(x, z) > 20) {
    return {
      weights,
      total: 0.15,
      dominant: BIOMES[0],
      defaultMeadow: 0.15
    };
  }
  return { weights, total, dominant, defaultMeadow: 0 };
}

/** Dominant biome id or 'apron' / 'city'. */
export function biomeAt(x, z) {
  if (isInsideCity(x, z)) return 'city';
  if (distOutsideCityLocal(x, z) < 40) return 'apron';
  const { dominant, total } = biomeInfluence(x, z);
  if (!dominant || total < 0.08) return 'meadow';
  return dominant.id;
}

/** Extra height contribution from biome hillBoost (normalized). */
export function biomeHillFactor(x, z) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  if (total + defaultMeadow < 1e-6) return 0;
  let h = defaultMeadow * 0.35;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    h += w * BIOMES[i].hillBoost;
    wSum += w;
  }
  return h / wSum;
}

/** Blended grass RGB 0–1. */
export function biomeGrassRgb(x, z, out = [0.29, 0.49, 0.25]) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  const g0 = BIOMES[0].grass;
  if (total + defaultMeadow < 1e-6) {
    out[0] = g0[0];
    out[1] = g0[1];
    out[2] = g0[2];
    return out;
  }
  let r = g0[0] * defaultMeadow;
  let g = g0[1] * defaultMeadow;
  let b = g0[2] * defaultMeadow;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const c = BIOMES[i].grass;
    r += w * c[0];
    g += w * c[1];
    b += w * c[2];
    wSum += w;
  }
  out[0] = r / wSum;
  out[1] = g / wSum;
  out[2] = b / wSum;
  return out;
}

export function biomeRockRgb(x, z, out = [0.42, 0.4, 0.38]) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  const g0 = BIOMES[0].rock;
  if (total + defaultMeadow < 1e-6) {
    out[0] = g0[0];
    out[1] = g0[1];
    out[2] = g0[2];
    return out;
  }
  let r = g0[0] * defaultMeadow;
  let g = g0[1] * defaultMeadow;
  let b = g0[2] * defaultMeadow;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const c = BIOMES[i].rock;
    r += w * c[0];
    g += w * c[1];
    b += w * c[2];
    wSum += w;
  }
  out[0] = r / wSum;
  out[1] = g / wSum;
  out[2] = b / wSum;
  return out;
}

export function biomeVegDensity(x, z) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  if (total + defaultMeadow < 1e-6) return 1;
  let v = 1.0 * defaultMeadow;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    v += w * BIOMES[i].vegDensity;
    wSum += w;
  }
  return v / wSum;
}

export function biomeTreeBias(x, z) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  if (total + defaultMeadow < 1e-6) return 0.4;
  let v = 0.4 * defaultMeadow;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    v += w * BIOMES[i].treeBias;
    wSum += w;
  }
  return v / wSum;
}

export function biomeRockBias(x, z) {
  const { weights, total, defaultMeadow } = biomeInfluence(x, z);
  if (total + defaultMeadow < 1e-6) return 0.15;
  let v = 0.15 * defaultMeadow;
  let wSum = defaultMeadow;
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    v += w * BIOMES[i].rockBias;
    wSum += w;
  }
  return v / wSum;
}

export function biomeWetland(x, z) {
  const { weights, total } = biomeInfluence(x, z);
  if (total < 1e-6) return 0;
  let v = 0;
  for (let i = 0; i < BIOMES.length; i++) {
    v += weights[i] * BIOMES[i].wetland;
  }
  return v / total;
}

export function biomeNames() {
  return BIOMES.map((b) => b.name);
}
