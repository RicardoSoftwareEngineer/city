/**
 * Multi-variant apartment room bake (spec 05 — 100 layouts via shared instances).
 *
 * Hitch-friendly architecture:
 *  - 20 furniture variants (floor+ceil+furniture) as InstancedMesh material buckets
 *  - 20 wall variants (3 plaster walls, unique CC0 albedo) as InstancedMesh buckets
 *  - layoutId → furnitureVariant + wallVariant (100 distinct looks)
 * Never unique Mesh clones / per-room PointLight.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGltf } from '../AssetLoader.js';
import {
  LOFT_FURNITURE_URL,
  NOVOPO_FURNITURE_URL,
  KIT_FURNITURE_URL
} from './roomTemplate.js';
import {
  FURNITURE_VARIANT_COUNT,
  WALL_VARIANT_COUNT,
  ROOM,
  getFurnitureTemplate,
  getWallPoolId,
  wallUrl,
  fitFor
} from './aptLayouts.js';

/** @type {null | { furnitureVariants: object[], wallVariants: object[], ready: boolean }} */
let variantsBaked = null;
/** @type {Promise<object>|null} */
let variantsPromise = null;

function std(color, opts = {}) {
  const base = new THREE.Color(color);
  const out = base.clone().multiplyScalar(0.35);
  if (opts.emissive != null) {
    const e = new THREE.Color(opts.emissive);
    const ei = opts.emissiveIntensity ?? 1;
    out.r = Math.min(1, out.r + e.r * ei);
    out.g = Math.min(1, out.g + e.g * ei);
    out.b = Math.min(1, out.b + e.b * ei);
  }
  return new THREE.MeshBasicMaterial({
    color: out,
    name: opts.name,
    map: opts.map || null,
    toneMapped: true
  });
}

function leanGeometry(geo) {
  const keep = new Set(['position', 'normal', 'uv']);
  for (const key of Object.keys(geo.attributes)) {
    if (!keep.has(key)) geo.deleteAttribute(key);
  }
  if (geo.morphAttributes) geo.morphAttributes = {};
  return geo;
}

function basicFromMat(src, cache, prefix = 'aptVar') {
  const key =
    (src?.map?.uuid || 'nomap') +
    ':' +
    (src?.name || '') +
    ':' +
    (src?.color ? src.color.getHexString() : 'fff');
  if (cache.has(key)) return cache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  color.multiplyScalar(1.12);
  color.r = Math.min(1, color.r + 0.1);
  color.g = Math.min(1, color.g + 0.08);
  color.b = Math.min(1, color.b + 0.05);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `${prefix}-${src.name}` : `${prefix}-mat`,
    side: THREE.DoubleSide,
    toneMapped: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 2;
    mat.map.generateMipmaps = true;
    mat.map.minFilter = THREE.LinearMipmapLinearFilter;
    mat.map.magFilter = THREE.LinearFilter;
  }
  cache.set(key, mat);
  return mat;
}

function pushBox(buckets, material, w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  if (!buckets.has(material)) buckets.set(material, []);
  buckets.get(material).push(geo);
}

function bakeSpecs(buckets, namePrefix) {
  const specs = [];
  let i = 0;
  for (const [material, list] of buckets) {
    if (!list.length) continue;
    const groups = new Map();
    for (const g of list) {
      const sig = Object.keys(g.attributes).sort().join(',');
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(g);
    }
    for (const [, geos] of groups) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      for (const g of geos) {
        if (g !== merged) g.dispose();
      }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      specs.push({
        geometry: merged,
        material,
        name: `${namePrefix}-${i++}`
      });
    }
  }
  return specs;
}

function indexPieces(root, map) {
  if (!root) return;
  root.traverse((o) => {
    if (o.name && !map.has(o.name)) map.set(o.name, o);
  });
}

/**
 * Place one named piece into buckets (floored Y-up kit / loft / novopo).
 */
function pushNamedPiece(buckets, pieceMap, pieceName, place, matCache) {
  const piece = pieceMap.get(pieceName);
  if (!piece) {
    // Silent skip — layout may reference optional novopo pieces
    return false;
  }
  piece.updateWorldMatrix(true, true);
  let sx = 1,
    sy = 1,
    sz = 1;
  const ex = piece.userData || {};
  if (Array.isArray(ex.size) && ex.size.length >= 3) {
    sx = Math.max(ex.size[0], 1e-4);
    sy = Math.max(ex.size[1], 1e-4);
    sz = Math.max(ex.size[2], 1e-4);
  } else {
    const box = new THREE.Box3().setFromObject(piece);
    const s = box.getSize(new THREE.Vector3());
    sx = Math.max(s.x, 1e-4);
    sy = Math.max(s.y, 1e-4);
    sz = Math.max(s.z, 1e-4);
  }
  const fit = fitFor(pieceName);
  const scale =
    (place.scale ?? 1) *
    Math.min(
      fit.targetHeight / sy,
      (fit.maxWidth ?? fit.targetHeight * 2) / sx,
      (fit.maxDepth ?? fit.targetHeight * 2) / sz
    );

  const pieceInv = new THREE.Matrix4().copy(piece.matrixWorld).invert();
  const placeMat = new THREE.Matrix4().compose(
    new THREE.Vector3(place.x, place.y ?? 0, place.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw ?? 0),
    new THREE.Vector3(scale, scale, scale)
  );

  piece.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const srcMats = Array.isArray(child.material) ? child.material : [child.material];
    const srcMat = srcMats[0];
    const mat = basicFromMat(srcMat, matCache);
    const geo = leanGeometry(child.geometry.clone());
    const local = new THREE.Matrix4().multiplyMatrices(pieceInv, child.matrixWorld);
    geo.applyMatrix4(local);
    geo.applyMatrix4(placeMat);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  });
  return true;
}

function loadWallAlbedo(id) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    const url = wallUrl(id);
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        tex.anisotropy = 2;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        resolve(tex);
      },
      undefined,
      () => {
        console.warn('[apt-variants] wall missing', id);
        resolve(null);
      }
    );
  });
}

function wallMaterial(map, wallId) {
  const color = new THREE.Color(0xfff6ea);
  color.multiplyScalar(1.08);
  color.r = Math.min(1, color.r + 0.06);
  color.g = Math.min(1, color.g + 0.04);
  return new THREE.MeshBasicMaterial({
    color,
    map: map || null,
    name: `apt-wall-${wallId}`,
    toneMapped: true
  });
}

/**
 * Bake 20 furniture + 20 wall InstancedMesh-ready spec sets.
 */
export async function ensureApartmentVariantsBaked() {
  if (variantsBaked) return variantsBaked;
  if (variantsPromise) return variantsPromise;
  variantsPromise = (async () => {
    const pieceMap = new Map();
    try {
      const loft = await loadGltf(LOFT_FURNITURE_URL);
      indexPieces(loft, pieceMap);
    } catch (e) {
      console.warn('[apt-variants] loft load failed', e);
    }
    await new Promise((r) => setTimeout(r, 0));
    try {
      const novo = await loadGltf(NOVOPO_FURNITURE_URL);
      indexPieces(novo, pieceMap);
    } catch (e) {
      console.warn('[apt-variants] novopo load failed', e);
    }
    await new Promise((r) => setTimeout(r, 0));
    try {
      const kit = await loadGltf(KIT_FURNITURE_URL);
      indexPieces(kit, pieceMap);
    } catch (e) {
      console.warn('[apt-variants] kit load failed', e);
    }

    const matCache = new Map();
    const floorMat = std(0xa89070, {
      roughness: 0.85,
      emissive: 0x3a3020,
      emissiveIntensity: 0.4,
      name: 'apt-floor'
    });
    const ceilMat = std(0xfffaf3, {
      roughness: 0.95,
      emissive: 0xfff5e8,
      emissiveIntensity: 0.55,
      name: 'apt-ceil'
    });

    const { width, depth, height, wallT } = ROOM;
    const furnitureVariants = [];

    for (let v = 0; v < FURNITURE_VARIANT_COUNT; v++) {
      const buckets = new Map();
      pushBox(buckets, floorMat, width, wallT, depth, 0, 0, depth * 0.5);
      pushBox(buckets, ceilMat, width, wallT, depth, 0, height, depth * 0.5);
      const pieces = getFurnitureTemplate(v);
      let placed = 0;
      for (const p of pieces) {
        if (pushNamedPiece(buckets, pieceMap, p.name, p, matCache)) placed++;
      }
      // Tiny art proxy if nothing placed (should not happen)
      if (placed === 0) {
        const art = std(0xffe0a8, { emissive: 0xffc878, emissiveIntensity: 0.65 });
        pushBox(buckets, art, 0.4, 0.5, 0.05, 0, 1.3, 2.8);
      }
      furnitureVariants.push({
        variant: v,
        roomSpecs: bakeSpecs(buckets, `apt-furn-${v}`),
        pieceCount: placed
      });
      // Yield between variants to keep main thread responsive during boot bake
      if (v % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }

    const wallVariants = [];
    for (let w = 0; w < WALL_VARIANT_COUNT; w++) {
      const wallId = getWallPoolId(w);
      const map = await loadWallAlbedo(wallId);
      const plaster = wallMaterial(map, wallId);
      const buckets = new Map();
      pushBox(buckets, plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5);
      pushBox(buckets, plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5);
      pushBox(buckets, plaster, width, height, wallT, 0, height * 0.5, depth);
      wallVariants.push({
        variant: w,
        wallId,
        roomSpecs: bakeSpecs(buckets, `apt-wall-${w}`)
      });
    }

    variantsBaked = {
      furnitureVariants,
      wallVariants,
      ready: true,
      furnitureVariantCount: FURNITURE_VARIANT_COUNT,
      wallVariantCount: WALL_VARIANT_COUNT,
      pieceMapSize: pieceMap.size,
      noPointLight: true,
      instanced: true
    };
    console.log(
      '[apt-variants] baked',
      FURNITURE_VARIANT_COUNT,
      'furniture ×',
      WALL_VARIANT_COUNT,
      'walls; pieces indexed',
      pieceMap.size
    );
    return variantsBaked;
  })();
  try {
    return await variantsPromise;
  } finally {
    variantsPromise = null;
  }
}

export function getApartmentVariantsBaked() {
  return variantsBaked;
}
