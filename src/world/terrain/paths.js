/**
 * Dirt paths for open countryside (Passo 3 + 8).
 * Seed-fixed Catmull-Rom corridors; bed ~4 m (half-width 2).
 * Four exits: south, west, north, east — mid-edges of cityBounds.
 * Optional short cross-link between south and west arms.
 * surfaceY = heightAt - pathDepression — shared by mesh + Heightfield.
 */

import {
  cityBounds,
  pavedInset,
  CITY_BURY_Y,
  CITY_BURY_RAMP
} from '../RoadDimensions.js';
import { heightAt, TERRAIN_SEED } from './heightField.js';
import { avenueBlendFactor } from './countryAvenue.js';

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

/**
 * Radial exit from a city mid-edge outward.
 * @param {'south'|'west'|'north'|'east'} dir
 */
function radialExit(rnd, b, midX, midZ, dir, length, steps, lateralAmp) {
  const ctrl = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const lateral = (rnd() - 0.5) * lateralAmp * Math.sin(u * Math.PI);
    if (dir === 'south') {
      ctrl.push({ x: midX + lateral, z: b.minZ - u * length });
    } else if (dir === 'north') {
      ctrl.push({ x: midX + lateral, z: b.maxZ + u * length });
    } else if (dir === 'west') {
      ctrl.push({ x: b.minX - u * length, z: midZ + lateral });
    } else {
      ctrl.push({ x: b.maxX + u * length, z: midZ + lateral });
    }
  }
  return ctrl;
}

function buildPaths() {
  const rnd = mulberry32(TERRAIN_SEED + 17);
  const b = cityBounds();
  // Mid of street grid (0 … 180), not including CITY_BOUND_PAD.
  const midX = (0 + 180) * 0.5;
  const midZ = (0 + 180) * 0.5;

  const southCtrl = radialExit(rnd, b, midX, midZ, 'south', 130, 8, 10);
  const westCtrl = radialExit(rnd, b, midX, midZ, 'west', 120, 7, 8);
  const northCtrl = radialExit(rnd, b, midX, midZ, 'north', 120, 7, 9);
  const eastCtrl = radialExit(rnd, b, midX, midZ, 'east', 110, 7, 8);

  // Short cross-link: mid-south arm → mid-west arm (keeps network connected).
  const southMid = southCtrl[Math.floor(southCtrl.length * 0.45)];
  const westMid = westCtrl[Math.floor(westCtrl.length * 0.45)];
  const linkCtrl = [
    { x: southMid.x, z: southMid.z },
    {
      x: southMid.x + (westMid.x - southMid.x) * 0.35 + (rnd() - 0.5) * 6,
      z: southMid.z + (westMid.z - southMid.z) * 0.35 + (rnd() - 0.5) * 6
    },
    {
      x: southMid.x + (westMid.x - southMid.x) * 0.7 + (rnd() - 0.5) * 5,
      z: southMid.z + (westMid.z - southMid.z) * 0.7 + (rnd() - 0.5) * 5
    },
    { x: westMid.x, z: westMid.z }
  ];

  polylines = [
    sampleSpline(southCtrl),
    sampleSpline(westCtrl),
    sampleSpline(northCtrl),
    sampleSpline(eastCtrl),
    sampleSpline(linkCtrl, 10)
  ];
}

buildPaths();

/** Path polyline ends (far tips) — used by tree scatter near exits. */
export function pathEnds() {
  return polylines.map((line) => line[line.length - 1]).filter(Boolean);
}

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

/**
 * Shared surface for visual tiles and Heightfield (follows the groove).
 *
 * Under the pavement the terrain dives to CITY_BURY_Y so border tiles can run
 * on INTO the city and hide beneath the asphalt: no half-tile band without
 * ground (the old fall-through), no 1 m crack next to the curb, and the flat
 * city box still wins the collision because it sits 10 cm higher.
 */
export function surfaceY(x, z) {
  // Country avenue wins over paved bury so the downtown exit has no shelf/seam.
  if (avenueBlendFactor(x, z) > 0.35) {
    return heightAt(x, z);
  }
  const inset = pavedInset(x, z);
  if (inset > 0) {
    const t = Math.min(1, inset / CITY_BURY_RAMP);
    return CITY_BURY_Y * (t * t * (3 - 2 * t));
  }
  return heightAt(x, z) - pathDepression(x, z);
}
