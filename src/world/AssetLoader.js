/**
 * AssetLoader — Centralized GLTF/GLB loader for all 3D models in the city.
 *
 * loadGltf(url) fetches each URL once (keyed with keepVertexColors).
 * The first caller gets the prepared root; later callers get a clone so they
 * can parent independently while sharing geometry/materials.
 *
 * Do not enable THREE.Cache: GLTFLoader uses ImageBitmapLoader, and a cached
 * bitmap is detached after the first GPU upload (hang / black textures).
 *
 * Default: neither cast nor receive. Ground / volumes / car opt in via shadowPolicy.
 * Vertex colors are stripped by default. Pass `{ keepVertexColors: true }`
 * for Nature Pack foliage and Source Downtown wear (COLOR_0).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMark, beginLoad } from '../engine/loadLog.js';

const gltfLoader = new GLTFLoader();
const inflight = new Map();
const issued = new Map();

function cacheKey(url, keepVertexColors, useLambert) {
  return `${url}|vc:${keepVertexColors ? 1 : 0}|lb:${useLambert ? 1 : 0}`;
}

const groundLambertByKey = new Map();

function groundLambert(material) {
  const hex = material?.color ? material.color.getHex() : 0x888888;
  const mapId = material?.map ? material.map.uuid : 'none';
  const vc = material?.vertexColors === true ? 1 : 0;
  const key = `${hex}|${mapId}|vc:${vc}`;
  if (!groundLambertByKey.has(key)) {
    groundLambertByKey.set(key, new THREE.MeshLambertMaterial({
      color: hex,
      map: material?.map ?? null,
      vertexColors: vc === 1
    }));
  }
  return groundLambertByKey.get(key);
}

/**
 * Prepare a loaded model: enable shadows, strip vertex colors.
 */
function prepareModel(root, keepVertexColors = false, useLambert = false) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;

      if (!keepVertexColors && child.geometry?.attributes.color) {
        child.geometry.deleteAttribute('color');
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const next = materials.map((material) => {
          if (keepVertexColors && child.geometry?.attributes.color) {
            material.vertexColors = true;
          } else if (!keepVertexColors) {
            material.vertexColors = false;
          }
          material.needsUpdate = true;
          return useLambert ? groundLambert(material) : material;
        });
        child.material = Array.isArray(child.material) ? next : next[0];
      }
    }
  });
  return root;
}

/**
 * Load a GLTF/GLB model. Returns the scene root (Object3D).
 * Returns null on failure so callers can safely check with `if (model)`.
 */
export function loadGltf(url, options = {}) {
  const keepVertexColors = options.keepVertexColors === true;
  const useLambert = options.useLambert === true;
  const key = cacheKey(url, keepVertexColors, useLambert);

  if (!inflight.has(key)) {
    inflight.set(
      key,
      new Promise((resolve) => {
        gltfLoader.load(
          url,
          (gltf) => {
            beginLoad('gltf:parse', url);
            const t0 = performance.now();
            const root = prepareModel(gltf.scene || gltf.scenes[0], keepVertexColors, useLambert);
            loadMark('gltf:parse', url, performance.now() - t0);
            resolve(root);
          },
          undefined,
          () => resolve(null)
        );
      })
    );
  }

  return inflight.get(key).then((root) => {
    if (!root) return null;
    const n = issued.get(key) || 0;
    issued.set(key, n + 1);
    if (n === 0) return root;
    const t0 = performance.now();
    const cloned = root.clone(true);
    const ms = performance.now() - t0;
    if (ms >= 2) loadMark('gltf:clone', url, ms);
    return cloned;
  });
}
