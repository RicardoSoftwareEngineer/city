/**
 * InstancedMesh from a loaded GLTF (one batch per mesh in the file).
 * GPU buffers grow in INSTANCE_BATCH-sized chunks — never one 336-instance mesh.
 */

import * as THREE from 'three';
import { beginLoad, loadMark } from '../engine/loadLog.js';
import { loadGovernor } from '../engine/LoadGovernor.js';
import { yieldToMain } from './yield.js';

function batchSize() {
  return loadGovernor.instanceBatch;
}

export const INSTANCE_BATCH = 24;

const dummy = new THREE.Object3D();
const composed = new THREE.Matrix4();
const rootInverse = new THREE.Matrix4();

function collectSpecs(template, options = {}) {
  const specs = [];
  template.updateMatrixWorld(true);
  rootInverse.copy(template.matrixWorld).invert();
  template.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (Array.isArray(child.material)) return;
    specs.push({
      geometry: child.geometry,
      material: child.material,
      local: new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld),
      name: child.name || template.name || 'instanced',
      castShadow: options.castShadow ?? child.castShadow,
      receiveShadow: options.receiveShadow ?? child.receiveShadow
    });
  });
  return specs;
}

function writePose(mesh, spec, pose, slot) {
  dummy.position.set(pose.x, pose.y ?? 0, pose.z);
  dummy.rotation.set(0, pose.rot ?? 0, 0);
  const s = pose.scale ?? 1;
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  composed.multiplyMatrices(dummy.matrix, spec.local);
  mesh.setMatrixAt(slot, composed);
}

function makeBatchMesh(parent, spec, capacity) {
  beginLoad('instancer', `${spec.name} x${capacity}`);
  const t0 = performance.now();
  const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, capacity);
  mesh.name = spec.name;
  mesh.castShadow = spec.castShadow;
  mesh.receiveShadow = spec.receiveShadow;
  mesh.frustumCulled = true;
  mesh.count = 0;
  parent.add(mesh);
  loadMark('instancer', `${spec.name} x${capacity}`, performance.now() - t0);
  return mesh;
}

export function addInstancedGltf(parent, template, poses, options = {}) {
  if (!template || poses.length === 0) return;
  const specs = collectSpecs(template, options);

  for (const spec of specs) {
    for (let offset = 0; offset < poses.length; ) {
      const slice = poses.slice(offset, offset + batchSize());
      const mesh = makeBatchMesh(parent, spec, slice.length);
      for (let i = 0; i < slice.length; i++) writePose(mesh, spec, slice[i], i);
      mesh.count = slice.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      offset += slice.length;
    }
  }
}

export async function addInstancedGltfAsync(parent, template, poses, options = {}) {
  if (!template || poses.length === 0) return;
  const specs = collectSpecs(template, options);

  for (const spec of specs) {
    for (let offset = 0; offset < poses.length; ) {
      const slice = poses.slice(offset, offset + batchSize());
      const mesh = makeBatchMesh(parent, spec, slice.length);
      for (let i = 0; i < slice.length; i++) writePose(mesh, spec, slice[i], i);
      mesh.count = slice.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      offset += slice.length;
      await yieldToMain();
    }
  }
}

export function chebyshev(x, z, ox, oz) {
  return Math.max(Math.abs(x - ox), Math.abs(z - oz));
}

export function minPoseDist(poses, ox, oz) {
  let min = Infinity;
  for (const p of poses) {
    const d = chebyshev(p.x, p.z, ox, oz);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Reveals instances by Chebyshev radius. Allocates GPU batches of INSTANCE_BATCH.
 */
export function createGrowingInstancedGltf(parent, template, poses, ox, oz, options = {}) {
  if (!template || poses.length === 0) {
    return { reveal() { return 0; }, maxDist: 0 };
  }

  const { onReveal, ...specOpts } = options;
  const sorted = poses.slice().sort(
    (a, b) => chebyshev(a.x, a.z, ox, oz) - chebyshev(b.x, b.z, ox, oz)
  );
  const specs = collectSpecs(template, specOpts);
  const batches = [];
  const step = batchSize();

  function ensureBatch(batchIndex) {
    if (batches[batchIndex]) return batches[batchIndex];
    const start = batchIndex * step;
    const capacity = Math.min(step, sorted.length - start);
    const meshes = specs.map((spec) => makeBatchMesh(parent, spec, capacity));
    batches[batchIndex] = { meshes, capacity };
    return batches[batchIndex];
  }

  let revealed = 0;
  const maxDist = chebyshev(sorted[sorted.length - 1].x, sorted[sorted.length - 1].z, ox, oz);

  return {
    maxDist,
    reveal(radius, maxAdd = Infinity) {
      let n = revealed;
      while (n < sorted.length && chebyshev(sorted[n].x, sorted[n].z, ox, oz) <= radius) n++;
      const batchEnd = (Math.floor(revealed / step) + 1) * step;
      const cap = Math.min(n, revealed + maxAdd, batchEnd);
      if (cap <= revealed) return 0;

      const before = revealed;
      for (let i = revealed; i < cap; i++) {
        const batchIndex = Math.floor(i / step);
        const slot = i % step;
        const batch = ensureBatch(batchIndex);
        const pose = sorted[i];
        for (let s = 0; s < specs.length; s++) {
          writePose(batch.meshes[s], specs[s], pose, slot);
        }
        onReveal?.(pose, i);
      }
      revealed = cap;
      const lastBatch = Math.floor((revealed - 1) / step);
      for (let b = 0; b <= lastBatch; b++) {
        const batch = batches[b];
        if (!batch) continue;
        const start = b * step;
        const filled = Math.min(revealed - start, batch.capacity);
        for (const mesh of batch.meshes) {
          mesh.count = Math.max(0, filled);
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
      return revealed - before;
    }
  };
}
