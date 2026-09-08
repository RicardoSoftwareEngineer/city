/**
 * Two-stage maps for streamed textured meshes (Pareto).
 * Reveal with a shared 4×4 placeholder first; upgrade to real maps when the
 * play-frame leftover budget admits the work. Under heap pressure, demote again.
 * Lean — not a second material engine.
 */

import * as THREE from 'three';
import { memoryGuardian } from '../engine/memoryGuardian.js';

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

/** @type {THREE.DataTexture|null} */
let shared = null;

/** Roots that currently show real maps and may be demoted under pressure. */
const upgradedRoots = new Set();

export function sharedPlaceholderMap() {
  if (shared) return shared;
  const data = new Uint8Array([180, 180, 180, 255]);
  shared = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  shared.colorSpace = THREE.SRGBColorSpace;
  shared.needsUpdate = true;
  shared.name = 'stream-placeholder-1x1';
  return shared;
}

function materialsOf(root) {
  const out = [];
  root?.traverse?.((child) => {
    if (!child.isMesh || !child.material) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of list) {
      if (m) out.push(m);
    }
  });
  return out;
}

/**
 * Swap real maps for the shared placeholder. Idempotent.
 * @param {THREE.Object3D} root
 * @returns {boolean} true if anything was demoted
 */
export function demoteMaps(root) {
  if (!root) return false;
  const ph = sharedPlaceholderMap();
  let changed = false;
  for (const mat of materialsOf(root)) {
    if (mat.userData?._mapsDemoted) continue;
    /** @type {Record<string, THREE.Texture|null>} */
    const stash = {};
    let had = false;
    for (const key of MAP_KEYS) {
      const tex = mat[key];
      if (tex && tex.isTexture) {
        stash[key] = tex;
        had = true;
      }
    }
    if (!had) continue;
    mat.userData = mat.userData || {};
    mat.userData._mapUpgrade = stash;
    mat.userData._mapsDemoted = true;
    // Color map → tiny placeholder; drop extras until upgrade (cheaper first draw).
    mat.map = ph;
    for (const key of MAP_KEYS) {
      if (key === 'map') continue;
      if (stash[key]) mat[key] = null;
    }
    mat.needsUpdate = true;
    changed = true;
  }
  upgradedRoots.delete(root);
  if (changed) {
    root.userData = root.userData || {};
    root.userData._mapsDemoted = true;
  }
  return changed;
}

/**
 * Restore stashed maps. No-op if nothing demoted.
 * @param {THREE.Object3D} root
 */
export function upgradeMaps(root) {
  if (!root) return false;
  let changed = false;
  for (const mat of materialsOf(root)) {
    const stash = mat.userData?._mapUpgrade;
    if (!stash || !mat.userData?._mapsDemoted) continue;
    for (const key of MAP_KEYS) {
      if (stash[key]) mat[key] = stash[key];
    }
    mat.userData._mapsDemoted = false;
    mat.needsUpdate = true;
    changed = true;
  }
  if (changed) {
    if (root.userData) root.userData._mapsDemoted = false;
    upgradedRoots.add(root);
  }
  return changed;
}

/** MemoryGuardian-friendly: drop upgrades when heap is hot. */
export function demoteUpgradedUnderPressure() {
  if (memoryGuardian.pressure < 0.6) return 0;
  let n = 0;
  for (const root of [...upgradedRoots]) {
    if (demoteMaps(root)) n += 1;
  }
  return n;
}
