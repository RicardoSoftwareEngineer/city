/**
 * Shared CPU height for open countryside (Passo 1).
 * Flat inside the city AABB; smooth blend into low hills outside.
 */

import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { cityBounds, isInsideCity } from '../RoadDimensions.js';

/** Fixed seed so every boot gets the same hills. */
export const TERRAIN_SEED = 42;

const AMPLITUDE_MIN = 1.5;
const AMPLITUDE_MAX = 4.0;
/** Blend width from city AABB edge (meters). */
const BLEND_IN = 8;
const BLEND_OUT = 16;

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

function rawHills(x, z) {
  // Two octaves; ImprovedNoise returns roughly [-1, 1].
  const n1 = noise.noise(x * 0.018 + seedOffset, seedOffset, z * 0.018);
  const n2 = noise.noise(x * 0.045 + seedOffset * 2, seedOffset + 1.7, z * 0.045);
  const n = n1 * 0.7 + n2 * 0.3;
  const t = (n + 1) * 0.5;
  return AMPLITUDE_MIN + t * (AMPLITUDE_MAX - AMPLITUDE_MIN);
}

/**
 * World Y of the countryside surface at (x, z).
 * Inside the city: 0 (sidewalk). Outside: hills with an 8–16 m soft blend.
 */
export function heightAt(x, z) {
  if (isInsideCity(x, z)) return 0;

  const d = distOutsideCity(x, z);
  const w = smoothstep(BLEND_IN, BLEND_OUT, d);
  if (w <= 0) return 0;
  return rawHills(x, z) * w;
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
