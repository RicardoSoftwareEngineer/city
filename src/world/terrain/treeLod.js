/**
 * Countryside tree LODs (Passo 14).
 * THREE.LOD per pose: full MegaKit near, simpler/far species beyond.
 * Streamed in budgeted chunks — never one giant InstancedMesh.
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { castOpts, noCastOpts } from '../shadowPolicy.js';
import { beginLoad } from '../../engine/loadLog.js';
import { chebyshev } from '../instancing.js';
import { yieldAfterWork, waitIfSlow } from '../yield.js';
import { kitUrl, NATURE } from './kitUrls.js';

const NEAR_DIST = 48;
const FAR_DIST = 140;
const CHUNK = 4;

const NEAR_URLS = [
  () => kitUrl('tallThick1'),
  () => kitUrl('tallThick2'),
  () => kitUrl('birch1'),
  () => kitUrl('cherry1')
];

const FAR_URLS = [
  () => kitUrl('giantPine1'),
  () => NATURE.commonTree1,
  () => NATURE.pine1
];

function splitRoundRobin(poses, n) {
  const buckets = Array.from({ length: n }, () => []);
  for (let i = 0; i < poses.length; i++) {
    buckets[i % n].push(poses[i]);
  }
  return buckets;
}

function placeClone(template, pose, scaleMul = 1, cast = true) {
  const root = template.clone(true);
  root.position.set(pose.x, pose.y, pose.z);
  root.rotation.y = pose.rot || 0;
  const s = (pose.scale || 1) * scaleMul;
  root.scale.setScalar(s);
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = cast;
    child.receiveShadow = false;
  });
  return root;
}

/**
 * Register tree LOD stream tasks (priority 4).
 * @param {import('../WorldStream.js').WorldStream} stream
 * @param {THREE.Object3D} parentGroup
 * @param {number} ox
 * @param {number} oz
 * @param {{x:number,y:number,z:number,rot?:number,scale?:number}[]} poses
 */
export function registerTreeLods(stream, parentGroup, ox, oz, poses) {
  if (!poses?.length) return;

  const group = new THREE.Group();
  group.name = 'treeLods';
  parentGroup.add(group);

  const nearBuckets = splitRoundRobin(poses, NEAR_URLS.length);
  // One task per near URL bucket so loads stay sliced.
  for (let bi = 0; bi < nearBuckets.length; bi++) {
    const bucket = nearBuckets[bi];
    if (!bucket.length) continue;
    const nearUrl = NEAR_URLS[bi]();
    const farUrl = FAR_URLS[bi % FAR_URLS.length]();
    const dist = Math.min(
      ...bucket.map((p) => chebyshev(p.x, p.z, ox, oz))
    );

    stream.addTask({
      dist,
      priority: 4,
      run: async () => {
        beginLoad('veg', `treeLod ${nearUrl.split('/').pop()}`);
        await waitIfSlow();
        const nearTpl = await loadGltf(nearUrl, castOpts());
        const farTpl = await loadGltf(farUrl, noCastOpts());
        if (!nearTpl && !farTpl) return;

        for (let i = 0; i < bucket.length; i++) {
          const pose = bucket[i];
          const lod = new THREE.LOD();
          lod.position.set(0, 0, 0);
          lod.name = `treeLod_${bi}_${i}`;

          if (nearTpl) {
            lod.addLevel(placeClone(nearTpl, pose, 1, true), 0);
          }
          if (farTpl) {
            // Simpler / slightly smaller far stand-in, no shadows.
            lod.addLevel(placeClone(farTpl, pose, 0.85, false), NEAR_DIST);
          } else if (nearTpl) {
            lod.addLevel(placeClone(nearTpl, pose, 0.7, false), NEAR_DIST);
          }
          // Cull past FAR_DIST via empty Object3D level.
          lod.addLevel(new THREE.Object3D(), FAR_DIST);

          group.add(lod);

          if ((i + 1) % CHUNK === 0) {
            await yieldAfterWork();
            await waitIfSlow();
          }
        }
        await yieldAfterWork();
      }
    });
  }
}
