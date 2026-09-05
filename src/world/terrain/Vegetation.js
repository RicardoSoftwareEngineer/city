/**
 * Countryside vegetation stream jobs (Passo 4–7, 10–15).
 * Prefer MegaKit shortlist via kitUrls; Nature Pack fallbacks.
 * Growing instancers only. Wind on foliage, not trees.
 * Prio 4 = base layers; prio 5 = denser grass carpet (Passo 12).
 */

import { castOpts, noCastOpts } from '../shadowPolicy.js';
import { beginLoad } from '../../engine/loadLog.js';
import { applyWindToObject } from './windMaterial.js';
import { PATH_HALF_WIDTH, distToPath } from './paths.js';
import { kitUrl, NATURE } from './kitUrls.js';
import {
  scatterGrid,
  scatterClusters,
  scatterTreeGroves,
  scatterHorizonPines,
  acceptFieldGrass,
  acceptClover,
  acceptFlower,
  acceptBush,
  acceptRock
} from './scatter.js';
import { registerTreeLods } from './treeLod.js';
import { WORLD_LINEAR_SCALE } from './biomes.js';
import { GROUND_BODY_HALF } from '../RoadDimensions.js';
import { yieldToMain } from '../yield.js';

export const VEG_PRIORITY = 4;
export const VEG_DENSE_PRIORITY = 5;
/** Field extent scaled with the √10 world (still denser near city). */
// Cap below full fence so register-time pose grids stay stream-friendly.
const FIELD_HALF = Math.min(380, Math.round(160 * WORLD_LINEAR_SCALE * 0.75));
/** Slightly smaller for denser carpet so scatter stays cheap. */
const DENSE_HALF = Math.min(300, Math.round(130 * WORLD_LINEAR_SCALE * 0.75));
const HORIZON_MIN = Math.round(360 * WORLD_LINEAR_SCALE);
const HORIZON_MAX = Math.min(GROUND_BODY_HALF - 40, Math.round(520 * WORLD_LINEAR_SCALE));
const RIDGE_MIN = Math.round(200 * WORLD_LINEAR_SCALE);
const RIDGE_MAX = Math.round(340 * WORLD_LINEAR_SCALE);

function windPrepare(strength, gust) {
  return (root) => applyWindToObject(root, { strength, gust });
}

function foliageOpts(strength, gust = 0.35) {
  return {
    ...noCastOpts(),
    prepare: windPrepare(strength, gust)
  };
}

function splitRoundRobin(poses, n) {
  const buckets = Array.from({ length: n }, () => []);
  for (let i = 0; i < poses.length; i++) {
    buckets[i % n].push(poses[i]);
  }
  return buckets;
}

function addVeg(stream, url, poses, opts, priority) {
  if (!url || !poses?.length) return;
  const name = url.split('/').pop() || url;
  const prev = opts.prepare;
  stream.addUrl(
    url,
    poses,
    {
      ...opts,
      prepare: (root) => {
        beginLoad('veg', name);
        if (typeof prev === 'function') prev(root);
      }
    },
    priority
  );
}

/**
 * Register vegetation urlJobs + tree LODs on the stream.
 * Call after registerTerrain(...).
 */
export async function registerVegetation(stream, parentGroup, ox, oz) {
  // --- Passo 4/5 base grass (prio 4) ---
  const tallGrass = scatterGrid({
    spacing: 3.5,
    seedSalt: 11,
    scaleMin: 0.7,
    scaleMax: 0.95,
    halfExtent: FIELD_HALF,
    accept: (x, z) => acceptFieldGrass(x, z, { maxSlope: 0.55 })
  });
  addVeg(
    stream,
    NATURE.grassCommonTall,
    tallGrass,
    foliageOpts(0.28),
    VEG_PRIORITY
  );
  await yieldToMain();

  const wispy = scatterGrid({
    spacing: 4,
    seedSalt: 22,
    scaleMin: 0.8,
    scaleMax: 1.15,
    halfExtent: FIELD_HALF,
    accept: (x, z) =>
      acceptFieldGrass(x, z, { maxSlope: 0.7, minPathDist: PATH_HALF_WIDTH })
  });
  addVeg(
    stream,
    NATURE.grassWispyShort,
    wispy,
    foliageOpts(0.24),
    VEG_PRIORITY
  );
  await yieldToMain();

  // --- Passo 12 denser MegaKit carpet (prio 5) ---
  const wideTall = scatterGrid({
    spacing: 2.2,
    seedSalt: 12,
    scaleMin: 0.9,
    scaleMax: 1.25,
    halfExtent: DENSE_HALF,
    accept: (x, z) => acceptFieldGrass(x, z, { maxSlope: 0.5 })
  });
  addVeg(
    stream,
    kitUrl('grassWideTall'),
    wideTall,
    foliageOpts(0.3, 0.4),
    VEG_DENSE_PRIORITY
  );
  await yieldToMain();

  const wideShort = scatterGrid({
    spacing: 2.5,
    seedSalt: 13,
    scaleMin: 0.85,
    scaleMax: 1.15,
    halfExtent: DENSE_HALF,
    accept: (x, z) => acceptFieldGrass(x, z, { maxSlope: 0.65 })
  });
  addVeg(
    stream,
    kitUrl('grassWideShort'),
    wideShort,
    foliageOpts(0.26, 0.38),
    VEG_DENSE_PRIORITY
  );
  await yieldToMain();

  const wheat = scatterGrid({
    spacing: 2.8,
    seedSalt: 14,
    scaleMin: 0.9,
    scaleMax: 1.3,
    halfExtent: DENSE_HALF - 10,
    accept: (x, z) => acceptFieldGrass(x, z, { maxSlope: 0.45 })
  });
  addVeg(
    stream,
    kitUrl('grassWheat'),
    wheat,
    foliageOpts(0.32, 0.42),
    VEG_DENSE_PRIORITY
  );
  await yieldToMain();

  // --- Passo 13 Witcher flowers (MegaKit 1/2/7 + Nature 3/4 extras, ≤6) ---
  const flowersA = scatterClusters({
    seedSpacing: 22,
    perCluster: 5,
    clusterRadius: 5.5,
    seedSalt: 33,
    maxTotal: 420,
    halfExtent: FIELD_HALF,
    accept: (x, z, rnd) => acceptFlower(x, z, rnd)
  });
  const [f1, f2, f7] = splitRoundRobin(flowersA, 3);
  addVeg(stream, kitUrl('flower1'), f1, foliageOpts(0.18), VEG_PRIORITY);
  addVeg(stream, kitUrl('flower2'), f2, foliageOpts(0.18), VEG_PRIORITY);
  addVeg(stream, kitUrl('flower7'), f7, foliageOpts(0.2), VEG_PRIORITY);

  const flowersB = scatterClusters({
    seedSpacing: 30,
    perCluster: 3,
    clusterRadius: 4.5,
    seedSalt: 34,
    maxTotal: 220,
    halfExtent: FIELD_HALF,
    accept: (x, z, rnd) => acceptFlower(x, z, rnd)
  });
  const [f3, f4] = splitRoundRobin(flowersB, 2);
  addVeg(stream, NATURE.flower3, f3, foliageOpts(0.17), VEG_PRIORITY);
  addVeg(stream, NATURE.flower4, f4, foliageOpts(0.17), VEG_PRIORITY);

  // Path shoulder clover denser (Passo 13)
  const clover = scatterGrid({
    spacing: 6,
    seedSalt: 44,
    scaleMin: 0.7,
    scaleMax: 1.1,
    halfExtent: FIELD_HALF,
    accept: (x, z, rnd) => acceptClover(x, z, rnd)
  });
  addVeg(stream, NATURE.clover1, clover, foliageOpts(0.16), VEG_PRIORITY);

  // Bushes — MegaKit large/long + Nature commons
  const bushes = scatterGrid({
    spacing: 24,
    seedSalt: 55,
    scaleMin: 0.9,
    scaleMax: 1.35,
    halfExtent: FIELD_HALF,
    accept: (x, z) => acceptBush(x, z)
  });
  const [bLarge, bLong, bCommon, bFlowers] = splitRoundRobin(bushes, 4);
  addVeg(
    stream,
    kitUrl('bushLargeFlowers'),
    bLarge,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );
  await yieldToMain();
  addVeg(
    stream,
    kitUrl('bushLong'),
    bLong,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );
  await yieldToMain();
  addVeg(
    stream,
    NATURE.bushCommon,
    bCommon,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );
  await yieldToMain();
  addVeg(
    stream,
    NATURE.bushCommonFlowers,
    bFlowers,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );
  await yieldToMain();

  // Accent plants
  const plants = scatterGrid({
    spacing: 32,
    seedSalt: 66,
    scaleMin: 0.85,
    scaleMax: 1.2,
    halfExtent: FIELD_HALF - 20,
    accept: (x, z) => distToPath(x, z) >= 4
  });
  addVeg(stream, kitUrl('plant5'), plants, foliageOpts(0.14), VEG_PRIORITY);

  // Rocks on steep slopes
  const rocks = scatterGrid({
    spacing: 28,
    seedSalt: 77,
    scaleMin: 0.7,
    scaleMax: 1.4,
    halfExtent: FIELD_HALF,
    accept: (x, z) => acceptRock(x, z)
  });
  addVeg(stream, kitUrl('rockBig1'), rocks, castOpts(), VEG_PRIORITY);

  // --- Passo 14 tree LODs (MegaKit near / simpler far) ---
  const trees = scatterTreeGroves({
    groveCount: 18,
    treesPerGrove: [5, 12],
    halfExtent: FIELD_HALF - 20,
    pathEndTrees: 4
  });
  registerTreeLods(stream, parentGroup, ox, oz, trees);
  await yieldToMain();

  // --- Passo 15 / vista: silhouette on far rising ridges (no shadows) ---
  const horizon = scatterHorizonPines({ count: 36, minR: HORIZON_MIN, maxR: HORIZON_MAX });
  addVeg(
    stream,
    kitUrl('giantPine1'),
    horizon,
    noCastOpts(),
    VEG_PRIORITY
  );
  await yieldToMain();

  // Sparse mid-ridge pines so the rise reads from a low camera.
  const ridgePines = scatterHorizonPines({ count: 28, minR: RIDGE_MIN, maxR: RIDGE_MAX, seedSalt: 311 });
  addVeg(
    stream,
    kitUrl('giantPine1'),
    ridgePines,
    noCastOpts(),
    VEG_PRIORITY
  );
  await yieldToMain();
}
