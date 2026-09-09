/**
 * Apartment interior template — InstancedMesh-ready (spec 05):
 * bake **once** into per-material geometries + shared **MeshBasic** materials
 * with emissive folded into color (no PointLight, no dynamic light loop).
 * ApartmentDirector stamps N instances → one draw per material for all live
 * rooms (≈10 draws total, not N meshes).
 *
 * Furniture: shared loft catalog GLB (sofa/chair/coffee/console/bar/plant/tray/wallart/rug) — albedo
 * MeshBasic only (sofa+bar atlas ≥1024), scaled into the shallow room so fabric reads through glass.
 * Curtain: one shared PlaneGeometry + Fabric 203 sheer MeshBasic (InstancedMesh).
 * Closed / curtain-only shells keep the fabric visible; open via scale only.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGltf } from '../AssetLoader.js';

/** Shared loft furniture kit (all furniture/decor; no architecture). */
export const LOFT_FURNITURE_URL = '/models/apartments/loft_furniture.glb?v=chair-upright-1';

/** Novopo Japanese loft-11 furniture/decor kit (sandbox catalog; no architecture). */
export const NOVOPO_FURNITURE_URL = '/models/apartments/novopo_furniture.glb?v=jp11-1';

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

/**
 * Near-glass loft placements (room: depth Z, width X, height Y).
 * Uniform scale from authored loft metres → readable through the pane.
 */
const LOFT_PLACEMENTS = {
  // Room: X∈[-1.8,1.8], Z∈[0,3.2] (glass at z≈0, opening faces −Z; street looks +Z).
  // GLB pieces are floored + Y-up — yaw-only. Full living-room subset of the loft catalog
  // (street sandbox exposes every piece via CATALOG_NAMES).
  sofa: { targetHeight: 0.6, maxWidth: 1.9, maxDepth: 1.35, x: 0.05, z: 2.05, yaw: Math.PI },
  chair: { targetHeight: 0.75, maxWidth: 0.8, maxDepth: 1.0, x: -1.2, z: 1.15, yaw: Math.PI * 0.65 },
  coffee: { targetHeight: 0.26, maxWidth: 0.9, maxDepth: 0.9, x: 0.0, z: 1.05, yaw: 0 },
  console: { targetHeight: 0.5, maxWidth: 0.9, maxDepth: 0.5, x: 1.45, z: 1.85, yaw: -Math.PI / 2 },
  bar: { targetHeight: 0.85, maxWidth: 1.0, maxDepth: 0.5, x: -1.4, z: 2.0, yaw: Math.PI / 2 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55, x: 1.35, z: 0.4, yaw: 0.25 },
  rug: { targetHeight: 0.015, maxWidth: 2.2, maxDepth: 2.4, x: 0.0, z: 1.5, yaw: 0 },
  wallart: { targetHeight: 0.7, maxWidth: 0.9, maxDepth: 0.1, x: -1.55, y: 1.2, z: 1.55, yaw: Math.PI / 2 }
};

/**
 * Bake Standard-looking room colors into MeshBasic.
 * Rooms are emissive-lit for street readability (spec 05) — they must not
 * join the Ultra-night street Spot/Point light loop (CPU MAIN tax).
 */
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
    // Keep name for debug; Basic ignores roughness/metalness/emissive.
    name: opts.name,
    toneMapped: true
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
 * MeshBasic from a glTF material — albedo map only (drop normal/rough/metal).
 * Mild lift so silhouettes read under ACES without PointLight.
 * @param {THREE.Material} src
 * @param {Map<string, THREE.MeshBasicMaterial>} cache
 */
function basicFromLoftMat(src, cache) {
  const key =
    (src?.map?.uuid || 'nomap') +
    ':' +
    (src?.name || '') +
    ':' +
    (src?.color ? src.color.getHexString() : 'fff');
  if (cache.has(key)) return cache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  // Mild lift so dark loft fabric (sofa atlas) reads outdoors under MeshBasic/ACES.
  // Do not rejoin the street-light loop — color multiply only.
  color.multiplyScalar(1.12);
  color.r = Math.min(1, color.r + 0.1);
  color.g = Math.min(1, color.g + 0.08);
  color.b = Math.min(1, color.b + 0.05);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `loft-${src.name}` : 'loft-mat',
    // Authored loft mats are DoubleSide; FrontSide blacks out inverted top faces.
    side: THREE.DoubleSide,
    toneMapped: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 2;
    // Shared across 128 instances — keep filtering cheap.
    mat.map.generateMipmaps = true;
    mat.map.minFilter = THREE.LinearMipmapLinearFilter;
    mat.map.magFilter = THREE.LinearFilter;
  }
  cache.set(key, mat);
  return mat;
}

/**
 * Strip non-merge-friendly attrs; keep position (+normal/uv when present).
 * @param {THREE.BufferGeometry} geo
 */
function leanGeometry(geo) {
  const keep = new Set(['position', 'normal', 'uv']);
  for (const key of Object.keys(geo.attributes)) {
    if (!keep.has(key)) geo.deleteAttribute(key);
  }
  if (geo.morphAttributes) {
    geo.morphAttributes = {};
  }
  return geo;
}

/**
 * Place one loft piece (GLB MUST be floored + Y-up + XZ-centered) into buckets.
 * Bakes nested mesh local matrices (lamp multi-prim), then yaw/scale/translate.
 * @param {Map<object, THREE.BufferGeometry[]>} buckets
 * @param {THREE.Object3D} root
 * @param {string} pieceName
 * @param {{targetHeight:number,maxWidth?:number,maxDepth?:number,x:number,y?:number,z:number,yaw:number}} place
 * @param {Map<string, THREE.MeshBasicMaterial>} matCache
 */
function pushLoftPiece(buckets, root, pieceName, place, matCache) {
  let piece = null;
  root.traverse((o) => {
    if (o.name === pieceName) piece = o;
  });
  if (!piece) {
    console.warn('[apartments] loft piece missing', pieceName);
    return;
  }

  piece.updateWorldMatrix(true, true);

  // Authored size from glTF extras (extract) or live AABB (Y = up).
  let sx = 1;
  let sy = 1;
  let sz = 1;
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
  const scale = Math.min(
    place.targetHeight / sy,
    (place.maxWidth ?? place.targetHeight * 2) / sx,
    (place.maxDepth ?? place.targetHeight * 2) / sz
  );

  // Child → piece-local (keeps lamp shade/base registered after floor extract).
  const pieceInv = new THREE.Matrix4().copy(piece.matrixWorld).invert();
  const placeMat = new THREE.Matrix4().compose(
    new THREE.Vector3(place.x, place.y ?? 0, place.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw),
    new THREE.Vector3(scale, scale, scale)
  );

  piece.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const srcMats = Array.isArray(child.material) ? child.material : [child.material];
    // Single-material path (our extract is one mat per prim).
    const srcMat = srcMats[0];
    const mat = basicFromLoftMat(srcMat, matCache);
    const geo = leanGeometry(child.geometry.clone());

    const local = new THREE.Matrix4().multiplyMatrices(pieceInv, child.matrixWorld);
    geo.applyMatrix4(local);
    geo.applyMatrix4(placeMat);

    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  });
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
  let remaining = 2;

  const applyIfReady = () => {
    remaining -= 1;
    if (remaining > 0 || !sharedCurtainMat) return;
    try {
      // MeshBasic: color + alpha only (skip normal/rough — would be no-ops / throws).
      if (pending.map) {
        pending.map.colorSpace = THREE.SRGBColorSpace;
        sharedCurtainMat.map = pending.map;
      } else {
        pending.normalMap?.dispose?.();
        pending.roughnessMap?.dispose?.();
      }
      if (pending.alphaMap) {
        pending.alphaMap.colorSpace = THREE.NoColorSpace;
        sharedCurtainMat.alphaMap = pending.alphaMap;
      }
      // Drop unused PBR maps — save VRAM on RX 580 8GB Ultra night.
      pending.normalMap?.dispose?.();
      pending.roughnessMap?.dispose?.();
      sharedCurtainMat.needsUpdate = true;
    } catch (err) {
      // Keep cream fallback — never let map swap take down the render path.
      console.warn('[apartments] curtain maps apply skipped', err);
    }
  };

  const prep = (tex) => {
    const img = tex.image;
    const w = img?.naturalWidth || img?.width || 0;
    const h = img?.naturalHeight || img?.height || 0;
    if (!(w > 0 && h > 0)) return null;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 4;
    // Prefer cheaper filtering — curtain is sheer overlay, not close-up hero.
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  };

  const onLoad = (key) => (tex) => {
    const ready = prep(tex);
    if (ready) pending[key] = ready;
    else tex.dispose?.();
    applyIfReady();
  };

  // Basic curtain: albedo + alpha only (2 maps). Normal/rough unused → VRAM.
  loader.load(CURTAIN_MAP_URLS.color, onLoad('map'), undefined, applyIfReady);
  loader.load(CURTAIN_MAP_URLS.opacity, onLoad('alphaMap'), undefined, applyIfReady);
}

export function getSharedCurtainMaterial() {
  if (!sharedCurtainMat) {
    // Warm cream tint — map color drives look once Fabric 203 loads.
    // MeshBasic: sheer curtains must not join the street-light loop.
    sharedCurtainMat = new THREE.MeshBasicMaterial({
      color: 0xf3ebe0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      alphaTest: 0.05,
      depthTest: true,
      depthWrite: false,
      toneMapped: true
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
 * Buckets must be attribute-compatible (box parts vs loft UV parts stay separate).
 * @param {Map<object, THREE.BufferGeometry[]>} buckets
 * @returns {{geometry:THREE.BufferGeometry,material:THREE.Material,name:string}[]}
 */
function bakeRoomSpecs(buckets) {
  /** @type {{geometry:THREE.BufferGeometry,material:THREE.Material,name:string}[]} */
  const specs = [];
  let i = 0;
  for (const [material, list] of buckets) {
    if (!list.length) continue;
    // mergeGeometries requires identical attribute sets — split if mixed.
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
        name: `apartment-room-part-${i++}`
      });
    }
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
  const art = std(0xffe0a8, { emissive: 0xffc878, emissiveIntensity: 0.65 });
  const artFrame = std(0x8a5a32, { roughness: 0.7, emissive: 0x2a1808, emissiveIntensity: 0.3 });
  /** @type {Map<object, THREE.BufferGeometry[]>} */
  const buckets = new Map();

  pushBox(buckets, floorMat, width, wallT, depth, 0, 0, depth * 0.5);
  pushBox(buckets, ceilMat, width, wallT, depth, 0, height, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5);
  // Back wall (lean plaster — no Brick_InteriorWall glTF; keeps few shared geos).
  pushBox(buckets, plaster, width, height, wallT, 0, height * 0.5, depth);
  // Small wall art (box proxy — not loft architecture).
  pushBox(buckets, artFrame, 0.02, 0.5, 0.6, -width * 0.5 + 0.06, 1.55, 1.2);
  pushBox(buckets, art, 0.01, 0.42, 0.52, -width * 0.5 + 0.08, 1.55, 1.2);

  /** @type {Map<string, THREE.MeshBasicMaterial>} */
  const loftMatCache = new Map();
  let loftOk = false;
  try {
    const loftRoot = await loadGltf(LOFT_FURNITURE_URL);
    if (loftRoot) {
      for (const [pieceName, place] of Object.entries(LOFT_PLACEMENTS)) {
        pushLoftPiece(buckets, loftRoot, pieceName, place, loftMatCache);
      }
      loftOk = true;
    }
  } catch (err) {
    console.warn('[apartments] loft furniture load failed; box fallback', err);
  }

  if (!loftOk) {
    // Box silhouette fallback (same layout as pre-loft proxies).
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
  }

  const roomSpecs = bakeRoomSpecs(buckets);
  baked = {
    roomSpecs,
    phase: 1,
    kitWall: false,
    mergedAsset: true,
    instanced: true,
    noPointLight: true,
    loftFurniture: loftOk
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
