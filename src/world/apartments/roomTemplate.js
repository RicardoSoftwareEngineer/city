/**
 * Apartment interior template — phase 1 (spec 05):
 * transparent glass view + bright emissive fill. **One merged mesh** (material
 * groups) baked into a cached template; each unit `clone(true)` shares
 * geometry + materials. One PointLight per unit for glass readability.
 *
 * Visibility bar: from the street you must instantly read “tem quarto”
 * (bright walls/emissive fill + large near-glass silhouette). Shared curtain
 * material+geometry so GPU compile warms once for all slots.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let cached = null;

/** One curtain program for every slot (scaled per unit). */
let sharedCurtainMat = null;
let sharedCurtainGeo = null;

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

function getSharedCurtainMaterial() {
  if (!sharedCurtainMat) {
    sharedCurtainMat = new THREE.MeshStandardMaterial({
      color: 0x5b21b6,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.97,
      depthTest: true,
      depthWrite: true
    });
  }
  return sharedCurtainMat;
}

/** Unit plane centered; mesh scale = window size. */
function getSharedCurtainGeometry() {
  if (!sharedCurtainGeo) {
    // Origin at top edge so scale.y shrink opens upward (curtain rises).
    sharedCurtainGeo = new THREE.PlaneGeometry(1, 1);
    sharedCurtainGeo.translate(0, -0.5, 0);
  }
  return sharedCurtainGeo;
}

/**
 * Bake every room box into **one** multi-material Mesh (mergeGeometries + groups).
 * Clones share that geometry and the material list — one asset, fewer draws/programs.
 */
function bakeMergedRoomMesh(buckets) {
  const materials = [];
  const geoms = [];
  for (const [material, list] of buckets) {
    if (!list.length) continue;
    // One merge per material so groups stay 1:1 with materials[].
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    for (const g of list) {
      if (g !== merged) g.dispose();
    }
    materials.push(material);
    geoms.push(merged);
  }
  if (!geoms.length) return null;
  const geometry = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, true);
  if (geoms.length > 1) {
    for (const g of geoms) g.dispose();
  }
  if (!geometry) return null;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.name = 'apartment-room-merged';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Room local space: opening faces −Z (street / glass). Depth into +Z.
 * Sync bake — no kit glTF wall (lean single asset; plaster back wall).
 */
export async function createApartmentRoom() {
  if (cached) return cached.clone(true);

  const room = new THREE.Group();
  room.name = 'apartment-room';

  // Shallower depth keeps furniture readable through the pane.
  const depth = 3.2;
  const width = 3.6;
  const height = 2.75;
  const wallT = 0.07;

  // Bright plaster + emissive so ACES outdoor exposure still reads “lit room”.
  const floorMat = std(0xa89070, { roughness: 0.85, emissive: 0x3a3020, emissiveIntensity: 0.25 });
  const ceilMat = std(0xfffaf3, { roughness: 0.95, emissive: 0xfff5e8, emissiveIntensity: 0.35 });
  const plaster = std(0xfff6ea, {
    roughness: 0.88,
    emissive: 0xffe8c8,
    emissiveIntensity: 0.55
  });
  const fabric = std(0x4a6fa5, {
    roughness: 0.85,
    emissive: 0x1a2a44,
    emissiveIntensity: 0.35
  });
  const wood = std(0x8a5a32, { roughness: 0.7, emissive: 0x2a1808, emissiveIntensity: 0.2 });
  const lampShade = std(0xfff4d6, { roughness: 0.55, emissive: 0xffe4a8, emissiveIntensity: 1.2 });
  const plant = std(0x3d9a4a, { roughness: 0.8, emissive: 0x145022, emissiveIntensity: 0.45 });
  const pot = std(0x9a7a60, { roughness: 0.8, emissive: 0x2a2018, emissiveIntensity: 0.2 });
  const cushion = std(0xd4784a, {
    roughness: 0.8,
    emissive: 0x4a2810,
    emissiveIntensity: 0.4
  });
  const art = std(0xffe0a8, { emissive: 0xffc878, emissiveIntensity: 0.5 });

  /** @type {Map<object, THREE.BufferGeometry[]>} */
  const buckets = new Map();

  pushBox(buckets, floorMat, width, wallT, depth, 0, 0, depth * 0.5);
  pushBox(buckets, ceilMat, width, wallT, depth, 0, height, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5);
  pushBox(buckets, plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5);
  // Back wall (lean plaster — no Brick_InteriorWall glTF; keeps 1 merged asset).
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

  const merged = bakeMergedRoomMesh(buckets);
  if (merged) room.add(merged);

  // One PointLight per room — Todos on Large (~77) must not spawn hundreds of lights.
  // Walls/furniture already carry emissive fill for street readability under ACES.
  const fill = new THREE.PointLight(0xfff2e0, 5.5, 9, 1.35);
  fill.position.set(0, height * 0.72, 0.85);
  room.add(fill);

  room.userData.phase = 1;
  room.userData.kitWall = false;
  room.userData.mergedAsset = true;
  cached = room;
  return room.clone(true);
}

/**
 * Fabric curtain outside glass. Shared material + unit geometry (scaled per
 * slot) so compileAsync warms one program for the whole facade — not 26.
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
