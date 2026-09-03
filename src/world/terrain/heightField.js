/**
 * Shared CPU height for open countryside.
 * Witcher-style vista: flush apron at the city → rolling mid → ridges →
 * distant peaks so a low camera still sees far vertical silhouette.
 */

import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { cityBounds, isInsideCity } from '../RoadDimensions.js';

/** Fixed seed so every boot gets the same hills. */
export const TERRAIN_SEED = 42;

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
 * World Y of the countryside surface at (x, z).
 * Inside the city: 0 (sidewalk). Outside: layered Witcher vista.
 */
export function heightAt(x, z) {
  if (isInsideCity(x, z)) return 0;

  const d = distOutsideCity(x, z);

  // Keep the first ~12–55 m flush with streets (no shelf at the curb).
  const apron = smoothstep(blendIn, blendOut, d);
  if (apron <= 0) return 0;

  const roll = n01(x, z, 0.014) * 0.65 + n01(x, z, 0.038, 2.1, 1.3) * 0.35;
  const ridge = n01(x, z, 0.0045, 4.0, 0.7) * 0.7 + n01(x, z, 0.011, 1.2, 3.4) * 0.3;
  const peak = n01(x, z, 0.0019, 8.0, 2.2) * 0.75 + n01(x, z, 0.0055, 0.4, 6.1) * 0.25;

  // Distance bands (meters outside city AABB).
  const mid = smoothstep(45, 170, d); // rolling hills
  const rise = smoothstep(150, 310, d); // rising ridges
  const far = smoothstep(280, 520, d); // distant peaks / silhouette

  let h = 0;
  // Soft near rolls (still almost street-level next to the city).
  h += (0.2 + roll * 2.0) * apron * (1 - mid * 0.55);
  // Mid countryside — readable hills without blocking the horizon.
  h += (2.5 + roll * 11) * mid * (1 - rise * 0.4);
  // Ridges that lift the eye toward the distance.
  h += (14 + ridge * 36) * rise * (1 - far * 0.3);
  // Far peaks — vertical silhouette visible from a low camera.
  h += (48 + peak * 100) * far;

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
