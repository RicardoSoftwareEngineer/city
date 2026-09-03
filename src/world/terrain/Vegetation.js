/**
 * Countryside vegetation stream jobs (Passo 4–7).
 * Degrau 1 densities. Growing instancers via addUrl.
 * Wind on grass / flowers / bushes only — not trees (shared city URLs).
 */

import { castOpts, noCastOpts } from '../shadowPolicy.js';
import { applyWindToObject } from './windMaterial.js';
import { PATH_HALF_WIDTH, distToPath } from './paths.js';
import {
  scatterGrid,
  scatterClusters,
  scatterTreeGroves,
  acceptFieldGrass,
  acceptClover,
  acceptBush
} from './scatter.js';

const N = '/models/nature';
const VEG_PRIORITY = 4;
/** Degrau 1 field extent — not full ±300. */
const FIELD_HALF = 160;

function windPrepare(strength) {
  return (root) => applyWindToObject(root, { strength });
}

function foliageOpts(strength) {
  return {
    ...noCastOpts(),
    prepare: windPrepare(strength)
  };
}

function splitRoundRobin(poses, n) {
  const buckets = Array.from({ length: n }, () => []);
  for (let i = 0; i < poses.length; i++) {
    buckets[i % n].push(poses[i]);
  }
  return buckets;
}

/**
 * Register vegetation urlJobs on the stream (priority 4).
 * Call after registerTerrain(...).
 */
export function registerVegetation(stream, _parentGroup, _ox, _oz) {
  const tallGrass = scatterGrid({
    spacing: 3.5,
    seedSalt: 11,
    scaleMin: 0.85,
    scaleMax: 1.2,
    halfExtent: FIELD_HALF,
    accept: (x, z) => acceptFieldGrass(x, z, { maxSlope: 0.55 })
  });
  stream.addUrl(
    `${N}/Grass_Common_Tall.gltf`,
    tallGrass,
    foliageOpts(0.28),
    VEG_PRIORITY
  );

  const wispy = scatterGrid({
    spacing: 4,
    seedSalt: 22,
    scaleMin: 0.8,
    scaleMax: 1.15,
    halfExtent: FIELD_HALF,
    accept: (x, z) =>
      acceptFieldGrass(x, z, { maxSlope: 0.7, minPathDist: PATH_HALF_WIDTH })
  });
  stream.addUrl(
    `${N}/Grass_Wispy_Short.gltf`,
    wispy,
    foliageOpts(0.24),
    VEG_PRIORITY
  );

  const flowers = scatterClusters({
    seedSpacing: 26,
    perCluster: 4,
    clusterRadius: 5,
    seedSalt: 33,
    maxTotal: 360,
    halfExtent: FIELD_HALF,
    accept: (x, z) => distToPath(x, z) >= PATH_HALF_WIDTH
  });
  const [f3, f4] = splitRoundRobin(flowers, 2);
  stream.addUrl(`${N}/Flower_3_Group.gltf`, f3, foliageOpts(0.18), VEG_PRIORITY);
  stream.addUrl(`${N}/Flower_4_Group.gltf`, f4, foliageOpts(0.18), VEG_PRIORITY);

  const clover = scatterGrid({
    spacing: 10,
    seedSalt: 44,
    scaleMin: 0.7,
    scaleMax: 1.1,
    halfExtent: FIELD_HALF,
    accept: (x, z, rnd) => acceptClover(x, z, rnd)
  });
  stream.addUrl(`${N}/Clover_1.gltf`, clover, foliageOpts(0.16), VEG_PRIORITY);

  const bushes = scatterGrid({
    spacing: 26,
    seedSalt: 55,
    scaleMin: 0.9,
    scaleMax: 1.35,
    halfExtent: FIELD_HALF,
    accept: (x, z) => acceptBush(x, z)
  });
  const [bCommon, bFlowers] = splitRoundRobin(bushes, 2);
  stream.addUrl(
    `${N}/Bush_Common.gltf`,
    bCommon,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );
  stream.addUrl(
    `${N}/Bush_Common_Flowers.gltf`,
    bFlowers,
    { ...castOpts(), prepare: windPrepare(0.12) },
    VEG_PRIORITY
  );

  const trees = scatterTreeGroves({
    groveCount: 8,
    treesPerGrove: [5, 10],
    halfExtent: FIELD_HALF - 20
  });
  const [t1, t2, t3] = splitRoundRobin(trees, 3);
  stream.addUrl(`${N}/CommonTree_1.gltf`, t1, castOpts(), VEG_PRIORITY);
  stream.addUrl(`${N}/CommonTree_2.gltf`, t2, castOpts(), VEG_PRIORITY);
  stream.addUrl(`${N}/CommonTree_3.gltf`, t3, castOpts(), VEG_PRIORITY);
}
