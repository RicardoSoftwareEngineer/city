/**
 * CityGrid — 4×4 street neighborhood.
 *
 * Repeated tiles (asphalt, sidewalk, stripe, planter, trees, T / 4-way)
 * are InstancedMesh batches, not one Object3D per tile.
 */

import * as THREE from 'three';
import { loadGltf } from './AssetLoader.js';
import {
  ASPHALT_TILE_SIZE,
  GRID_PITCH,
  GRID_STREET_COUNT,
  INTERSECTION_CLEAR,
  SIDEWALK_CENTER_X,
  SIDEWALK_CURB_TREE_X,
  SIDEWALK_TILE_SIZE,
  gridStreetCoords
} from './RoadDimensions.js';
import { downtown } from './downtownSrc.js';
import { noCastOpts, castOpts, groundOpts } from './shadowPolicy.js';

const CAST_KEYS = new Set(['planter', 'tree1', 'tree2', 'tree3', 'tree4', 'tree5']);
const GROUND_KEYS = new Set([
  'fourWay', 'tee', 'curve', 'asphalt',
  'stripe', 'straight', 'broken1', 'broken2', 'insetL', 'insetR'
]);

const ASSET_PATHS = {
  fourWay:     downtown('Street_4WayIntersection.gltf'),
  tee:         downtown('Street_TIntersection.gltf'),
  curve:       downtown('Street_Curve_2Lane_Curb.gltf'),
  asphalt:     downtown('Street_Asphalt_6x6.gltf'),
  brokenLine:  downtown('Decal_BrokenLine_Straight.gltf'),
  doubleYellow: downtown('Decal_DoubleYellow_Straight.gltf'),
  stripe:      downtown('Sidewalk_Straight_3m_Stripe.gltf'),
  straight:    downtown('Sidewalk_Straight_3m.gltf'),
  broken1:     downtown('Sidewalk_Straight_3m_Broken1.gltf'),
  broken2:     downtown('Sidewalk_Straight_3m_Broken2.gltf'),
  insetL:      downtown('Sidewalk_Inset_3m_L.gltf'),
  insetR:      downtown('Sidewalk_Inset_3m_R.gltf'),
  planter:     downtown('Sidewalk_Planter.gltf'),
  tree1:       '/models/nature/CommonTree_1.gltf',
  tree2:       '/models/nature/CommonTree_2.gltf',
  tree3:       '/models/nature/CommonTree_3.gltf',
  tree4:       '/models/nature/CommonTree_4.gltf',
  tree5:       '/models/nature/CommonTree_5.gltf',
  decalSlow:   downtown('Decal_Slow.gltf'),
  decalOnly:   downtown('Decal_Only.gltf'),
  decalStop:   downtown('Decal_Stop.gltf'),
  decalArrow:  downtown('Decal_ArrowStraight.gltf'),
  decalTurnL:  downtown('Decal_ArrowTurnLeft.gltf'),
  decalTurnR:  downtown('Decal_ArrowTurnRight.gltf'),
  decalBike:   downtown('Decal_Bikelane.gltf'),
  decalWalk:   downtown('Decal_Crosswalk.gltf')
};

const PLANTER_SCALE = 0.48;
const TREE_SCALE = 0.42;
const TREE_KEYS = ['tree1', 'tree2', 'tree3', 'tree4', 'tree5'];

function nearAny(value, coords) {
  return coords.some((c) => Math.abs(value - c) < INTERSECTION_CLEAR);
}

function asphaltRange(a, b) {
  const start = a + 12;
  const end = b - 12;
  const values = [];
  for (let v = start; v <= end + 0.01; v += ASPHALT_TILE_SIZE) values.push(v);
  return values;
}

/** Kit T is closed on local +Z. Corners close the stub that would leak into the void. */
function teeRotation(i, j, last) {
  const west = i === 0;
  const east = i === last;
  const south = j === 0;
  const north = j === last;
  const edges = (west ? 1 : 0) + (east ? 1 : 0) + (south ? 1 : 0) + (north ? 1 : 0);

  if (edges === 0) return null;

  if (south && west) return Math.PI;
  if (south && east) return Math.PI / 2;
  if (north && east) return 0;
  if (north && west) return -Math.PI / 2;

  if (south) return Math.PI;
  if (north) return 0;
  if (west) return -Math.PI / 2;
  if (east) return Math.PI / 2;
  return Math.PI;
}

export class CityGrid {
  collectJobs() {
    const xs = gridStreetCoords();
    const zs = gridStreetCoords();
    const last = GRID_STREET_COUNT - 1;
    const jobs = [];
    const add = (key, poses, priority = 0) => {
      if (poses.length) {
        jobs.push({
          url: ASSET_PATHS[key],
          poses,
          options: CAST_KEYS.has(key)
            ? castOpts()
            : GROUND_KEYS.has(key)
              ? groundOpts()
              : noCastOpts(),
          priority
        });
      }
    };

    this.collectIntersections(add, xs, zs, last);
    this.collectEdgeCurves(add, xs, zs, last);
    this.collectAsphalt(add, xs, zs);
    this.collectCenterLines(add, xs, zs);
    this.collectDoubleYellow(add, xs, zs);
    this.collectSidewalks(add, xs, zs);
    this.collectExtraDecals(add, xs, zs);
    return jobs;
  }

  collectOriginDecalTask(parentGroup) {
    return async () => {
      const [decalSlow, decalOnly, decalStop, decalArrow] = await Promise.all([
        loadGltf(ASSET_PATHS.decalSlow, noCastOpts()),
        loadGltf(ASSET_PATHS.decalOnly, noCastOpts()),
        loadGltf(ASSET_PATHS.decalStop, noCastOpts()),
        loadGltf(ASSET_PATHS.decalArrow, noCastOpts())
      ]);
      this.placeOriginDecals(parentGroup, { decalSlow, decalOnly, decalStop, decalArrow });
    };
  }

  collectIntersections(add, xs, zs, last) {
    const fourWayPoses = [];
    const teePoses = [];

    for (let i = 0; i < GRID_STREET_COUNT; i++) {
      for (let j = 0; j < GRID_STREET_COUNT; j++) {
        const rot = teeRotation(i, j, last);
        const pose = { x: xs[i], z: zs[j], rot: rot === null ? 0 : rot };
        if (rot === null) fourWayPoses.push(pose);
        else teePoses.push(pose);
      }
    }

    add('fourWay', fourWayPoses, 0);
    add('tee', teePoses, 0);
  }

  collectEdgeCurves(add, xs, zs, last) {
    add('curve', [
      { x: xs[0] - 21, z: zs[0] - 21, rot: 0 },
      { x: xs[last] + 9, z: zs[0] - 9, rot: Math.PI / 2 },
      { x: xs[last] + 9, z: zs[last] + 9, rot: 0 },
      { x: xs[0] - 9, z: zs[last] + 9, rot: -Math.PI / 2 }
    ], 0);
  }

  collectAsphalt(add, xs, zs) {
    const poses = [];

    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        for (const z of asphaltRange(zs[j], zs[j + 1])) {
          poses.push({ x: xs[i] - 3, z });
          poses.push({ x: xs[i] + 3, z });
        }
      }
    }

    for (let j = 0; j < zs.length; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        for (const x of asphaltRange(xs[i], xs[i + 1])) {
          poses.push({ x, z: zs[j] - 3 });
          poses.push({ x, z: zs[j] + 3 });
        }
      }
    }

    add('asphalt', poses, 0);
  }

  collectCenterLines(add, xs, zs) {
    const poses = [];

    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        for (const z of asphaltRange(zs[j], zs[j + 1])) {
          poses.push({ x: xs[i], y: 0.015, z, rot: Math.PI / 2 });
        }
      }
    }

    for (let j = 0; j < zs.length; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        for (const x of asphaltRange(xs[i], xs[i + 1])) {
          poses.push({ x, y: 0.015, z: zs[j] });
        }
      }
    }

    add('brokenLine', poses, 0);
  }

  collectDoubleYellow(add, xs, zs) {
    const poses = [];
    const zStreet = zs[1];
    for (let i = 0; i < xs.length - 1; i++) {
      for (const x of asphaltRange(xs[i], xs[i + 1])) {
        poses.push({ x, y: 0.016, z: zStreet });
      }
    }
    add('doubleYellow', poses, 0);
  }

  collectSidewalks(add, xs, zs) {
    const walkPoses = [];
    const broken1Poses = [];
    const broken2Poses = [];
    const insetLPoses = [];
    const insetRPoses = [];
    const stripePoses = [];
    const planterPoses = [];
    const treePoses = TREE_KEYS.map(() => []);
    let treeIndex = 0;
    let tileIndex = 0;

    const addWalk = (x, z, rot) => {
      const kind = tileIndex++ % 11;
      const pose = { x, z, rot };
      if (kind === 3) broken1Poses.push(pose);
      else if (kind === 7) broken2Poses.push(pose);
      else if (kind === 5) insetLPoses.push(pose);
      else if (kind === 9) insetRPoses.push(pose);
      else walkPoses.push(pose);
      stripePoses.push(pose);
    };

    const addTrees = (pairs) => {
      for (const p of pairs) {
        planterPoses.push({ x: p.x, z: p.z, scale: PLANTER_SCALE });
        const kind = treeIndex % TREE_KEYS.length;
        treePoses[kind].push({
          x: p.x,
          z: p.z,
          rot: ((p.x + p.z) * 0.7) % (Math.PI * 2),
          scale: TREE_SCALE
        });
        treeIndex++;
      }
    };

    for (const sx of xs) {
      const zMin = zs[0];
      const zMax = zs[zs.length - 1];
      const zTiles = [];
      for (let z = zMin - SIDEWALK_CENTER_X; z <= zMax + SIDEWALK_CENTER_X + 0.01; z += SIDEWALK_TILE_SIZE) {
        if (!nearAny(z, zs)) zTiles.push(z);
      }

      for (let t = 0; t < zTiles.length; t++) {
        const z = zTiles[t];
        addWalk(sx - SIDEWALK_CENTER_X, z, Math.PI / 2);
        addWalk(sx + SIDEWALK_CENTER_X, z, -Math.PI / 2);
        if (t % 6 !== 0) continue;
        addTrees([
          { x: sx - SIDEWALK_CURB_TREE_X, z },
          { x: sx + SIDEWALK_CURB_TREE_X, z }
        ]);
      }
    }

    for (const sz of zs) {
      const xMin = xs[0];
      const xMax = xs[xs.length - 1];
      const xTiles = [];
      for (let x = xMin - SIDEWALK_CENTER_X; x <= xMax + SIDEWALK_CENTER_X + 0.01; x += SIDEWALK_TILE_SIZE) {
        if (!nearAny(x, xs)) xTiles.push(x);
      }

      for (let t = 0; t < xTiles.length; t++) {
        const x = xTiles[t];
        addWalk(x, sz - SIDEWALK_CENTER_X, 0);
        addWalk(x, sz + SIDEWALK_CENTER_X, Math.PI);
        if (t % 6 !== 0) continue;
        addTrees([
          { x, z: sz - SIDEWALK_CURB_TREE_X },
          { x, z: sz + SIDEWALK_CURB_TREE_X }
        ]);
      }
    }

    add('straight', walkPoses, 0);
    add('broken1', broken1Poses, 0);
    add('broken2', broken2Poses, 0);
    add('insetL', insetLPoses, 0);
    add('insetR', insetRPoses, 0);
    add('stripe', stripePoses, 0);
    add('planter', planterPoses, 1);
    TREE_KEYS.forEach((key, i) => add(key, treePoses[i], 1));
  }

  placeOriginDecals(group, { decalSlow, decalOnly, decalStop, decalArrow }) {
    if (decalSlow) {
      const slow = decalSlow.clone();
      slow.position.set(3.0, 0.025, 14.5);
      slow.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.color = new THREE.Color(0xfacc15);
        }
      });
      group.add(slow);
    }

    if (decalOnly) {
      const only = decalOnly.clone();
      only.position.set(-3.0, 0.025, 14.5);
      only.rotation.y = Math.PI;
      group.add(only);
    }

    if (decalArrow) {
      const arrow = decalArrow.clone();
      arrow.position.set(-3.0, 0.025, 21.0);
      arrow.rotation.y = Math.PI;
      group.add(arrow);
    }

    if (decalStop) {
      const stop = decalStop.clone();
      stop.position.set(3.0, 0.025, GRID_PITCH * 0.5 + 20);
      stop.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.color = new THREE.Color(0xfacc15);
        }
      });
      group.add(stop);
    }
  }

  collectExtraDecals(add, xs, zs) {
    const y = 0.026;
    const bikePoses = [];
    const sx = xs[2];
    for (let j = 0; j < zs.length - 1; j++) {
      for (const z of asphaltRange(zs[j], zs[j + 1])) {
        bikePoses.push({ x: sx + 4.2, y, z, rot: Math.PI / 2 });
      }
    }
    add('decalBike', bikePoses, 1);
    add('decalWalk', [
      { x: xs[1], y, z: (zs[0] + zs[1]) / 2, rot: Math.PI / 2 },
      { x: (xs[1] + xs[2]) / 2, y, z: zs[1] }
    ], 1);
    add('decalTurnL', [{ x: xs[0] + 3, y, z: zs[1] + 14, rot: 0 }], 1);
    add('decalTurnR', [{ x: xs[0] - 3, y, z: zs[1] + 14, rot: 0 }], 1);
  }
}
