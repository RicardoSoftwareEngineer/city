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
import { yieldToMain } from './yield.js';
import { cachedFetch } from '../engine/assetDiskCache.js';

const gltfLoader = new GLTFLoader();
const inflight = new Map();
const issued = new Map();

function cacheKey(url, keepVertexColors, useLambert) {
  return `${url}|vc:${keepVertexColors ? 1 : 0}|lb:${useLambert ? 1 : 0}`;
}

const groundLambertByKey = new Map();

function groundLambert(material) {
  const hex = material?.color ? material.color.getHex() : 0x888888;
  if (!groundLambertByKey.has(hex)) {
    groundLambertByKey.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  }
  return groundLambertByKey.get(hex);
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
function stripGltfTextures(json) {
  json.images = [];
  json.textures = [];
  for (const material of json.materials || []) {
    const pbr = material.pbrMetallicRoughness;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
  }
}

function finishGltf(url, gltf, keepVertexColors, useLambert) {
  const t0 = performance.now();
  const root = prepareModel(gltf.scene || gltf.scenes[0], keepVertexColors, useLambert);
  loadMark('gltf:parse', url, performance.now() - t0);
  return root;
}

function loadGltfPayload(url, keepVertexColors, useLambert) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);

  // Disk cache first (Cache API). Same parse path either way — loader unchanged.
  return cachedFetch(url)
    .then(async (res) => {
      if (!res.ok) return null;
      if (useLambert) {
        const json = await res.json();
        stripGltfTextures(json);
        await yieldToMain();
        beginLoad('gltf:parse', url);
        return new Promise((resolve) => {
          gltfLoader.parse(
            json,
            dir,
            (gltf) => resolve(finishGltf(url, gltf, keepVertexColors, true)),
            () => resolve(null)
          );
        });
      }
      const buf = await res.arrayBuffer();
      await yieldToMain();
      beginLoad('gltf:parse', url);
      return new Promise((resolve) => {
        gltfLoader.parse(
          buf,
          dir,
          (gltf) => resolve(finishGltf(url, gltf, keepVertexColors, false)),
          () => resolve(null)
        );
      });
    })
    .catch(() => null);
}

/** Drop in-memory parse promises so a disk-cache clear can re-fetch this session. */
export function clearGltfMemoryDedupe() {
  inflight.clear();
  issued.clear();
}

export function loadGltf(url, options = {}) {
  const keepVertexColors = options.keepVertexColors === true;
  const useLambert = options.useLambert === true;
  const key = cacheKey(url, keepVertexColors, useLambert);

  if (!inflight.has(key)) {
    inflight.set(key, loadGltfPayload(url, keepVertexColors, useLambert));
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
