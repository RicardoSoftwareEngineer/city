/**
 * Bakes a modular building (hundreds of kit pieces) into a few meshes,
 * one per material. That is what actually reduces draw calls.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { yieldToMain } from '../yield.js';
import { loadGovernor } from '../../engine/LoadGovernor.js';
import { beginLoad, loadMark } from '../../engine/loadLog.js';

const KEEP = new Set(['position', 'normal', 'uv', 'uv1', 'uv2', 'color']);
const OPTIONAL = ['uv1', 'uv2', 'color'];

function keepDrawAttrs(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!KEEP.has(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function unifyOptionalAttrs(geoms) {
  for (const name of OPTIONAL) {
    const allHave = geoms.every((g) => g.attributes[name]);
    if (!allHave) {
      for (const g of geoms) g.deleteAttribute(name);
      continue;
    }
    if (name === 'color') {
      const sizes = new Set(geoms.map((g) => g.attributes.color.itemSize));
      const types = new Set(geoms.map((g) => g.attributes.color.array.constructor.name));
      if (sizes.size > 1 || types.size > 1) {
        for (const g of geoms) g.deleteAttribute('color');
      }
    }
  }
}

function extractGroup(geometry, group) {
  const result = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    result.setAttribute(name, geometry.attributes[name]);
  }
  if (geometry.index) {
    const sliced = geometry.index.array.slice(group.start, group.start + group.count);
    result.setIndex(new THREE.BufferAttribute(sliced, 1));
  }
  if (geometry.attributes.tangent) result.deleteAttribute('tangent');
  return result;
}

function materialKey(material) {
  return [
    material.name || 'mat',
    material.map?.uuid || 'nomap',
    material.vertexColors ? 'vc' : '',
    material.color?.getHexString?.() || '',
    material.metalness ?? '',
    material.roughness ?? ''
  ].join('|');
}

function eachMaterialGeom(child, visit) {
  if (child.name && child.name.includes('convcol')) return;
  const materials = Array.isArray(child.material) ? child.material : [child.material];
  const groups = child.geometry.groups;
  if (groups && groups.length > 1) {
    for (const group of groups) {
      visit(extractGroup(child.geometry, group), materials[group.materialIndex] || materials[0]);
    }
    return;
  }
  visit(child.geometry, materials[0]);
}

export async function mergeBuilding(root, label = root?.name || 'building') {
  beginLoad('merge', label);
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const children = [];
  root.traverse((child) => {
    if (child.isMesh && child.geometry) children.push(child);
  });

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    eachMaterialGeom(child, (geometry, material) => {
      if (!material) return;
      const baked = keepDrawAttrs(geometry);
      baked.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld));
      const key = materialKey(material);
      if (!buckets.has(key)) buckets.set(key, { material, geoms: [] });
      buckets.get(key).geoms.push(baked);
    });
    if ((i + 1) % loadGovernor.mergeStride === 0) await yieldToMain();
  }

  const merged = new THREE.Group();
  merged.name = root.name;
  merged.userData = { ...root.userData };

  let n = 0;
  for (const { material, geoms } of buckets.values()) {
    unifyOptionalAttrs(geoms);
    const geometry = mergeGeometries(geoms, false);
    if (geometry) {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const meshMat = material.clone();
      if (geometry.attributes.color) {
        meshMat.vertexColors = true;
        meshMat.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geometry, meshMat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      merged.add(mesh);
    }
    n++;
    if (n % Math.max(1, Math.round(5 - loadGovernor.level)) === 0) await yieldToMain();
  }

  loadMark('merge', label, performance.now() - t0);
  return merged;
}
