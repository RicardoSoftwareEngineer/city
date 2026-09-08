/**
 * Apartment interior template — InstancedMesh-ready (spec 05):
 * bake **once** into per-material geometries + shared Standard materials with
 * emissive fill (no PointLight). ApartmentDirector stamps N instances → one
 * draw per material for all live rooms (≈10 draws total, not N meshes).
 *
 * Curtain: one shared PlaneGeometry + Fabric 203 sheer material (InstancedMesh).
 * Closed / curtain-only shells keep the fabric visible; open via scale only.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** @type {{ roomSpecs: {geometry:THREE.BufferGeometry,material:THREE.Material,name:string}[], phase:number }|null} */
let baked = null;

/** One curtain program for every slot (scaled per unit / instance). */
let sharedCurtainMat = null;
let sharedCurtainGeo = null;
/** @type {boolean} */
let curtainMapsStarted = false;

const CURTAIN_MAP_URLS = {
  color: '/textures/curtain/fabric203_color.png',
  normal: '/textures/curtain/fabric203_normal.png',
  rough: '/textures/curtain/fabric203_rough.png',
  opacity: '/textures/curtain/fabric203_opacity.png'
};

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.05,
    ...opts
  });
}

/**
 * Push a box (local TRS already applied into the geometry) into a material bucket.
 * @param {Map<object, THREE.BufferGeometry[]>} buckets
 * @param {THREE.Material} material
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function pushBox(buckets, material, w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  if (!buckets.has(material)) buckets.set(material, []);
  buckets.get(material).push(geo);
}

/**
 * Lazy-load ShareTextures Fabric 203 maps onto the shared curtain material.
 * Non-blocking: solid cream fallback until maps arrive, then swap once.
 */
function ensureCurtainMaps() {
  if (curtainMapsStarted || !sharedCurtainMat) return;
  curtainMapsStarted = true;

  const loader = new THREE.TextureLoader();
  /** @type {{map?: THREE.Texture, normalMap?: THREE.Texture, roughnessMap?: THREE.Texture, alphaMap?: THREE.Texture}} */
  const pending = {};
  let remaining = 4;

  const applyIfReady = () => {
    remaining -= 1;
    if (remaining > 0 || !sharedCurtainMat) return;
    if (pending.map) {
      pending.map.colorSpace = THREE.SRGBColorSpace;
      sharedCurtainMat.map = pending.map;
    }
    if (pending.normalMap) {
      pending.normalMap.colorSpace = THREE.NoColorSpace;
      sharedCurtainMat.normalMap = pending.normalMap;
      sharedCurtainMat.normalScale.set(0.55, 0.55);
    }
    if (pending.roughnessMap) {
      pending.roughnessMap.colorSpace = THREE.NoColorSpace;
      sharedCurtainMat.roughnessMap = pending.roughnessMap;
    }
    if (pending.alphaMap) {
      pending.alphaMap.colorSpace = THREE.NoColorSpace;
      sharedCurtainMat.alphaMap = pending.alphaMap;
    }
    sharedCurtainMat.needsUpdate = true;
  };

  const prep = (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 4;
    return tex;
  };

  loader.load(CURTAIN_MAP_URLS.color, (tex) => {
    pending.map = prep(tex);
    applyIfReady();
  }, undefined, applyIfReady);

  loader.load(CURTAIN_MAP_URLS.normal, (tex) => {
    pending.normalMap = prep(tex);
    applyIfReady();
  }, undefined, applyIfReady);

  loader.load(CURTAIN_MAP_URLS.rough, (tex) => {
    pending.roughnessMap = prep(tex);
    applyIfReady();
  }, undefined, applyIfReady);

  loader.load(CURTAIN_MAP_URLS.opacity, (tex) => {
    pending.alphaMap = prep(tex);
    applyIfReady();
  }, undefined, applyIfReady);
}

export function getSharedCurtainMaterial() {
  if (!sharedCurtainMat) {
    // Warm cream tint — map color drives look once Fabric 203 loads.
    sharedCurtainMat = new THREE.MeshStandardMaterial({
      color: 0xf3ebe0,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      alphaTest: 0.05,
      depthTest: true,
      depthWrite: false
    });
    ensureCurtainMaps();
  }
  return sharedCurtainMat;
}

/** Unit plane centered; mesh/instance scale = window size. */
export function getSharedCurtainGeometry() {
  if (!sharedCurtainGeo) {
    // Origin at top edge so scale.y shrink opens upward (curtain rises).
    sharedCurtainGeo = new THREE.PlaneGeometry(1, 1);
    sharedCurtainGeo.translate(0, -0.5, 0);
  }
  return sharedCurtainGeo;
}

/**
 * Merge each material bucket into one geometry (InstancedMesh = 1 mat each).
 * @param {Map<object, THREE.BufferGeometry[]>} buckets
 * @returns {{geometry:THREE.BufferGeometry,material:THREE.Material,name:string}[]}
 */
function bakeRoomSpecs(buckets) {
  /** @type {{geometry:THREE.BufferGeometry,material:THREE.Material,name:string}[]} */
  const specs = [];
  let i = 0;
  for (const [material, list] of buckets) {
    if (!list.length) continue;
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    for (const g of list) {
      if (g !== merged) g.dispose();
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    specs.push({
      geometry: merged,
      material,
      name: `apartment-room-part-${i++}`
    });
  }
  return specs;
}

/**
 * Bake shared room geometries + materials once. No PointLight — emissive carry
 * street readability under ACES so InstancedMesh stays cheap.
 */
export async function ensureApartmentRoomBaked() {
  if (baked) return baked;

  // Shallower depth keeps furniture readable through the pane.
  const depth = 3.2;
  const width = 3.6;
  const height = 2.75;
  const wallT = 0.07;

  // Bright plaster + stronger emissive (replaces former per-room PointLight).
  const floorMat = std(0xa89070, { roughness: 0.85, emissive: 0x3a3020, emissiveIntensity: 0.4 });
  const ceilMat = std(0xfffaf3, { roughness: 0.95, emissive: 0xfff5e8, emissiveIntensity: 0.55 });
  const plaster = std(0xfff6ea, {
    roughness: 0.88,
    emissive: 0xffe8c8,
    emissiveIntensity: 0.75
  });
  const fabric = std(0x4a6fa5, {
    roughness: 0.85,
    emissive: 0x1a2a44,
    emissiveIntensity: 0.45
  });
  const wood = std(0x8a5a32, { roughness: 0.7, emissive: 0x2a1808, emissiveIntensity: 0.3 });
  const lampShade = std(0xfff4d6, { roughness: 0.55, emissive: 0xffe4a8, emissiveIntensity: 1.45 });
  const plant = std(0x3d9a4a, { roughness: 0.8, emissive: 0x145022, emissiveIntensity: 0.55 });
  const pot = std(0x9a7a60, { roughness: 0.8, emissive: 0x2a2018, emissiveIntensity: 0.3 });
  const cushion = std(0xd4784a, {
    roughness: 0.8,
    emissive: 0x4a2810,
    emissiveIntensity: 0.5
  });
  const art = std(0xffe0a8, { emissive: 0xffc878, emissiveIntensity: 0.65 });

  /** @type {Map<object, THREE.BufferGeometry[]>} */
  const buckets = new Map();

  pushBox(buckets, floorMat, width, wallT, depth, 0, 0, depth * 0.5);
  pushBox(buckets, ceilMat, width, wallT, depth, 0, height, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5);
  // Back wall (lean plaster — no Brick_InteriorWall glTF; keeps few shared geos).
  pushBox(buckets, plaster, width, height, wallT, 0, height * 0.5, depth);

  // ——— Near-glass silhouette (small Z) so street view instantly reads “room” ———
  pushBox(buckets, pot, 0.38, 0.28, 0.38, 1.15, 0.18, 0.55);
  pushBox(buckets, plant, 0.48, 0.85, 0.48, 1.15, 0.72, 0.55);
  pushBox(buckets, plant, 0.22, 0.35, 0.22, 1.15, 1.25, 0.55);
  pushBox(buckets, fabric, 2.0, 0.48, 0.72, -0.15, 0.32, 0.95);
  pushBox(buckets, fabric, 2.0, 0.42, 0.16, -0.15, 0.66, 1.22);
  pushBox(buckets, fabric, 0.16, 0.42, 0.62, -1.07, 0.58, 0.95);
  pushBox(buckets, fabric, 0.16, 0.42, 0.62, 0.77, 0.58, 0.95);
  pushBox(buckets, cushion, 0.7, 0.14, 0.4, -0.15, 0.6, 0.85);
  pushBox(buckets, wood, 0.9, 0.06, 0.5, -0.1, 0.4, 1.7);
  pushBox(buckets, wood, 0.06, 0.36, 0.06, -0.42, 0.18, 1.55);
  pushBox(buckets, wood, 0.06, 0.36, 0.06, 0.22, 0.18, 1.55);
  pushBox(buckets, wood, 0.06, 0.36, 0.06, -0.42, 0.18, 1.85);
  pushBox(buckets, wood, 0.06, 0.36, 0.06, 0.22, 0.18, 1.85);
  pushBox(buckets, wood, 0.08, 1.2, 0.08, -1.35, 0.6, 0.7);
  pushBox(buckets, lampShade, 0.48, 0.14, 0.48, -1.35, 1.28, 0.7);
  pushBox(buckets, wood, 0.02, 0.5, 0.6, -width * 0.5 + 0.06, 1.55, 1.2);
  pushBox(buckets, art, 0.01, 0.42, 0.52, -width * 0.5 + 0.08, 1.55, 1.2);

  const roomSpecs = bakeRoomSpecs(buckets);
  baked = {
    roomSpecs,
    phase: 1,
    kitWall: false,
    mergedAsset: true,
    instanced: true,
    noPointLight: true
  };
  return baked;
}

/**
 * Warm / debug: non-instanced group sharing baked geos/mats (no PointLight).
 * Prefer InstancedMesh in ApartmentDirector for live facades.
 */
export async function createApartmentRoom() {
  const { roomSpecs } = await ensureApartmentRoomBaked();
  const room = new THREE.Group();
  room.name = 'apartment-room';
  for (const spec of roomSpecs) {
    const mesh = new THREE.Mesh(spec.geometry, spec.material);
    mesh.name = spec.name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    room.add(mesh);
  }
  room.userData.phase = 1;
  room.userData.kitWall = false;
  room.userData.mergedAsset = true;
  room.userData.instanced = true;
  room.userData.noPointLight = true;
  return room;
}

/**
 * Fabric curtain outside glass. Shared material + unit geometry (scaled per
 * slot / instance) so compileAsync warms one program for the whole facade.
 * Do not mutate material.opacity (shared); open via scale/visibility only.
 */
export function createCurtain(width, height) {
  const w = Math.max(width, 0.5) * 1.12;
  const h = Math.max(height, 0.5) * 1.12;
  const mesh = new THREE.Mesh(getSharedCurtainGeometry(), getSharedCurtainMaterial());
  mesh.name = 'apartment-curtain';
  mesh.renderOrder = 40;
  mesh.frustumCulled = false;
  mesh.scale.set(w, h, 1);
  mesh.position.y = Math.max(height, 0.5) * 0.5;
  mesh.userData.baseHeight = Math.max(height, 0.5);
  mesh.userData.baseWidth = Math.max(width, 0.5);
  return mesh;
}

/** @deprecated Phase 1: opaque reveal removed — real glass + 3D room. */
export function createRevealPlane() {
  return null;
}
