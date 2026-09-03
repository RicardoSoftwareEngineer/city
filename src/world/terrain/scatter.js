/**
 * Deterministic countryside vegetation poses (Passo 5–7, 12–14).
 * Grid + jitter from TERRAIN_SEED. Rejects city, path bed, steep slopes.
 */

import { isInsideCity, GROUND_BODY_HALF } from '../RoadDimensions.js';
import { distOutsideCity, slopeAt, TERRAIN_SEED } from './heightField.js';
import { isInAnyRiver } from '../water/rivers.js';
import {
  distToPath,
  isPathBed,
  pathEnds,
  PATH_HALF_WIDTH,
  PATH_SHOULDER,
  surfaceY
} from './paths.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scatter poses on a jittered grid.
 */
export function scatterGrid(opts) {
  const {
    spacing,
    seedSalt = 1,
    scaleMin = 0.85,
    scaleMax = 1.25,
    accept = () => true,
    halfExtent = GROUND_BODY_HALF
  } = opts;

  const poses = [];
  const rnd = mulberry32(TERRAIN_SEED + seedSalt);
  const start = -halfExtent + spacing * 0.5;

  for (let x = start; x < halfExtent; x += spacing) {
    for (let z = start; z < halfExtent; z += spacing) {
      const jx = x + (rnd() - 0.5) * spacing * 0.7;
      const jz = z + (rnd() - 0.5) * spacing * 0.7;
      if (isInsideCity(jx, jz)) continue;
      if (isInAnyRiver(jx, jz)) continue;
      if (distOutsideCity(jx, jz) < 4) continue;
      if (!accept(jx, jz, rnd)) continue;
      const scale = scaleMin + rnd() * (scaleMax - scaleMin);
      poses.push({
        x: jx,
        y: surfaceY(jx, jz),
        z: jz,
        rot: rnd() * Math.PI * 2,
        scale
      });
    }
  }
  return poses;
}

/** Tall / wispy grass: no path bed, slope cap for tall. */
export function acceptFieldGrass(x, z, { maxSlope = 0.55, minPathDist = PATH_HALF_WIDTH } = {}) {
  if (distToPath(x, z) < minPathDist) return false;
  if (maxSlope != null && slopeAt(x, z) > maxSlope) return false;
  return true;
}

/** Clover: denser on shoulder (Passo 13). */
export function acceptClover(x, z, rnd) {
  const d = distToPath(x, z);
  if (d < PATH_HALF_WIDTH) return false;
  if (d < PATH_SHOULDER) return rnd() < 0.55;
  return rnd() < 0.22;
}

/** Flowers prefer field + path shoulder (Passo 13). */
export function acceptFlower(x, z, rnd) {
  const d = distToPath(x, z);
  if (d < PATH_HALF_WIDTH) return false;
  if (d < PATH_SHOULDER + 1.5) return rnd() < 0.7;
  return rnd() < 0.45;
}

/** Bushes: ≥5 m from path axis. */
export function acceptBush(x, z) {
  return distToPath(x, z) >= 5;
}

/** Trees: ≥8 m from city, ≥5 m from path. */
export function acceptTree(x, z) {
  if (distOutsideCity(x, z) < 8) return false;
  return distToPath(x, z) >= 5;
}

/** Rocks on steep slopes (Passo 11 visual companion). */
export function acceptRock(x, z) {
  if (distToPath(x, z) < PATH_HALF_WIDTH + 1) return false;
  return slopeAt(x, z) > 0.65;
}

/**
 * Poisson-ish clusters: pick seeds on a coarse grid, place a few near each.
 */
export function scatterClusters(opts) {
  const {
    seedSpacing = 28,
    perCluster = 3,
    clusterRadius = 6,
    seedSalt = 50,
    scaleMin = 0.9,
    scaleMax = 1.2,
    accept = () => true,
    halfExtent = GROUND_BODY_HALF,
    maxTotal = 400
  } = opts;

  const poses = [];
  const rnd = mulberry32(TERRAIN_SEED + seedSalt);
  const start = -halfExtent + seedSpacing * 0.5;

  for (let x = start; x < halfExtent && poses.length < maxTotal; x += seedSpacing) {
    for (let z = start; z < halfExtent && poses.length < maxTotal; z += seedSpacing) {
      const sx = x + (rnd() - 0.5) * seedSpacing * 0.5;
      const sz = z + (rnd() - 0.5) * seedSpacing * 0.5;
      if (isInsideCity(sx, sz)) continue;
      if (isInAnyRiver(sx, sz)) continue;
      if (distOutsideCity(sx, sz) < 4) continue;
      if (isPathBed(sx, sz)) continue;
      if (!accept(sx, sz, rnd)) continue;

      const n = 1 + Math.floor(rnd() * perCluster);
      for (let i = 0; i < n && poses.length < maxTotal; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = rnd() * clusterRadius;
        const px = sx + Math.cos(ang) * rad;
        const pz = sz + Math.sin(ang) * rad;
        if (isInsideCity(px, pz)) continue;
        if (isInAnyRiver(px, pz)) continue;
        if (distOutsideCity(px, pz) < 4) continue;
        if (isPathBed(px, pz)) continue;
        if (!accept(px, pz, rnd)) continue;
        poses.push({
          x: px,
          y: surfaceY(px, pz),
          z: pz,
          rot: rnd() * Math.PI * 2,
          scale: scaleMin + rnd() * (scaleMax - scaleMin)
        });
      }
    }
  }
  return poses;
}

/**
 * Grove centers then trees around them.
 * Also plants a few trees near each path end so exits enter groves (Passo 14).
 */
export function scatterTreeGroves(opts = {}) {
  const {
    groveCount = 8,
    treesPerGrove = [5, 10],
    groveMinDist = 45,
    seedSalt = 90,
    halfExtent = GROUND_BODY_HALF - 20,
    pathEndTrees = 4
  } = opts;

  const rnd = mulberry32(TERRAIN_SEED + seedSalt);
  const centers = [];
  let attempts = 0;
  while (centers.length < groveCount && attempts < 400) {
    attempts += 1;
    const x = (rnd() * 2 - 1) * halfExtent;
    const z = (rnd() * 2 - 1) * halfExtent;
    if (isInsideCity(x, z)) continue;
    if (distOutsideCity(x, z) < 8) continue;
    if (distToPath(x, z) < 8) continue;
    let ok = true;
    for (const c of centers) {
      if (Math.hypot(c.x - x, c.z - z) < groveMinDist) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    centers.push({ x, z });
  }

  // Path-end mini-groves so dirt exits visually enter woodland.
  for (const end of pathEnds()) {
    if (!end) continue;
    if (isInsideCity(end.x, end.z)) continue;
    centers.push({ x: end.x, z: end.z, pathEnd: true });
  }

  const poses = [];
  for (const c of centers) {
    const n = c.pathEnd
      ? pathEndTrees
      : treesPerGrove[0] +
        Math.floor(rnd() * (treesPerGrove[1] - treesPerGrove[0] + 1));
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = c.pathEnd ? 4 + rnd() * 10 : 2 + rnd() * 14;
      const x = c.x + Math.cos(ang) * rad;
      const z = c.z + Math.sin(ang) * rad;
      if (c.pathEnd) {
        if (isInsideCity(x, z)) continue;
        if (isInAnyRiver(x, z)) continue;
        if (distOutsideCity(x, z) < 6) continue;
        // Allow slightly closer to path at exits.
        if (distToPath(x, z) < 3.5) continue;
      } else if (!acceptTree(x, z) || isInAnyRiver(x, z)) {
        continue;
      }
      poses.push({
        x,
        y: surfaceY(x, z),
        z,
        rot: rnd() * Math.PI * 2,
        scale: 0.95 + rnd() * 0.45
      });
    }
  }
  return poses;
}

/** Sparse distant silhouette pines (Passo 15). */
export function scatterHorizonPines(opts = {}) {
  const {
    count = 14,
    seedSalt = 210,
    minR = 210,
    maxR = 280
  } = opts;
  const rnd = mulberry32(TERRAIN_SEED + seedSalt);
  const poses = [];
  let attempts = 0;
  while (poses.length < count && attempts < 200) {
    attempts += 1;
    const ang = rnd() * Math.PI * 2;
    const r = minR + rnd() * (maxR - minR);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (isInsideCity(x, z)) continue;
    poses.push({
      x,
      y: surfaceY(x, z),
      z,
      rot: rnd() * Math.PI * 2,
      scale: 1.2 + rnd() * 0.6
    });
  }
  return poses;
}
