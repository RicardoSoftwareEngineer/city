/**
 * Dirt paths for open countryside (Passo 3).
 * Seed-fixed Catmull-Rom corridors; bed ~4 m (half-width 2).
 * surfaceY = heightAt - pathDepression — shared by mesh + Heightfield.
 */

import { cityBounds } from '../RoadDimensions.js';
import { heightAt, TERRAIN_SEED } from './heightField.js';

export const PATH_HALF_WIDTH = 2.0;
/** Soft dirt→grass blend beyond the bed (meters). */
export const PATH_BLEND = 1.5;
/** Optional shoulder for sparse clover (halfWidth .. halfWidth+shoulder). */
export const PATH_SHOULDER = 3.0;
const PATH_DEPRESS = 0.08;

/** @type {{ x: number, z: number }[][]} */
let polylines = [];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleSpline(controls, samplesPerSeg = 12) {
  const pts = [];
  const n = controls.length;
  if (n < 2) return pts;
  for (let i = 0; i < n - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      pts.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t)
      });
    }
  }
  pts.push(controls[n - 1]);
  return pts;
}

function buildPaths() {
  const rnd = mulberry32(TERRAIN_SEED + 17);
  const b = cityBounds();
  // Mid of street grid (0 … 180), not including CITY_BOUND_PAD.
  const midX = (0 + 180) * 0.5;
  const midZ = (0 + 180) * 0.5;

  /** South exit: city south edge → ~130 m south with slight lateral noise. */
  const southCtrl = [];
  const southLen = 130;
  const southSteps = 8;
  for (let i = 0; i <= southSteps; i++) {
    const u = i / southSteps;
    const z = b.minZ - u * southLen;
    const lateral = (rnd() - 0.5) * 10 * Math.sin(u * Math.PI);
    southCtrl.push({ x: midX + lateral, z });
  }

  /** West exit: city west edge → ~120 m west. */
  const westCtrl = [];
  const westLen = 120;
  const westSteps = 7;
  for (let i = 0; i <= westSteps; i++) {
    const u = i / westSteps;
    const x = b.minX - u * westLen;
    const lateral = (rnd() - 0.5) * 8 * Math.sin(u * Math.PI);
    westCtrl.push({ x, z: midZ + lateral });
  }

  polylines = [sampleSpline(southCtrl), sampleSpline(westCtrl)];
}

buildPaths();

/**
 * Distance from (x,z) to the nearest path polyline (meters).
 */
export function distToPath(x, z) {
  let best = Infinity;
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const ax = line[i].x;
      const az = line[i].z;
      const bx = line[i + 1].x;
      const bz = line[i + 1].z;
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz;
      let t = 0;
      if (len2 > 1e-8) {
        t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / len2));
      }
      const px = ax + abx * t;
      const pz = az + abz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) best = d;
    }
  }
  return best;
}

/** True when inside the ~4 m dirt bed. */
export function isPathBed(x, z) {
  return distToPath(x, z) < PATH_HALF_WIDTH;
}

/** True on the soft shoulder (halfWidth .. shoulder). */
export function isPathShoulder(x, z) {
  const d = distToPath(x, z);
  return d >= PATH_HALF_WIDTH && d < PATH_SHOULDER;
}

/**
 * Slight groove on the bed (~5–10 cm). Soft falloff to zero at halfWidth+blend.
 */
export function pathDepression(x, z) {
  const d = distToPath(x, z);
  const outer = PATH_HALF_WIDTH + PATH_BLEND;
  if (d >= outer) return 0;
  if (d <= PATH_HALF_WIDTH) return PATH_DEPRESS;
  const t = (d - PATH_HALF_WIDTH) / PATH_BLEND;
  return PATH_DEPRESS * (1 - t);
}

/**
 * Dirt→grass mix factor: 1 = full dirt, 0 = full grass.
 * Soft falloff between halfWidth and halfWidth+PATH_BLEND.
 */
export function pathDirtFactor(x, z) {
  const d = distToPath(x, z);
  if (d <= PATH_HALF_WIDTH) return 1;
  const outer = PATH_HALF_WIDTH + PATH_BLEND;
  if (d >= outer) return 0;
  return 1 - (d - PATH_HALF_WIDTH) / PATH_BLEND;
}

/** Shared surface for visual tiles and Heightfield (follows the groove). */
export function surfaceY(x, z) {
  return heightAt(x, z) - pathDepression(x, z);
}
