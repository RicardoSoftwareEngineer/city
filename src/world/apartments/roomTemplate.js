/**
 * Apartment interior template — phase 1 (spec 05):
 * transparent glass view + MegaKit-adjacent materials (Brick_InteriorWall +
 * Standard props). Shared clone per unit. Quality grows “pouco a pouco”.
 *
 * Visibility bar: from the street you must instantly read “tem quarto”
 * (bright walls/emissive fill + large near-glass silhouette). Shared curtain
 * material+geometry so GPU compile warms once for all slots.
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { downtown } from '../downtownSrc.js';

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

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
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
 * Room local space: opening faces −Z (street / glass). Depth into +Z.
 * Async so we can pull Brick_InteriorWall from the downtown kit.
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

  room.add(box(width, wallT, depth, floorMat, 0, 0, depth * 0.5));
  room.add(box(width, wallT, depth, ceilMat, 0, height, depth * 0.5));

  // Side walls (bright plaster). Back wall prefers MegaKit brick interior piece.
  room.add(box(wallT, height, depth, plaster, -width * 0.5, height * 0.5, depth * 0.5));
  room.add(box(wallT, height, depth, plaster, width * 0.5, height * 0.5, depth * 0.5));

  let usedKitWall = false;
  try {
    const wallRoot = await loadGltf(downtown('Brick_InteriorWall_1.gltf'), {
      keepVertexColors: false
    });
    if (wallRoot) {
      const wall = wallRoot.clone(true);
      wall.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = false;
          c.receiveShadow = true;
          c.frustumCulled = false;
          // Clone mats — AssetLoader shares materials across glTF clones.
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          const next = mats.map((m) => {
            if (!m) return m;
            const cm = m.clone();
            if (cm.emissive) {
              cm.emissive.setHex(0x4a3828);
              cm.emissiveIntensity = Math.max(cm.emissiveIntensity || 0, 0.35);
            }
            if (cm.color) cm.color.offsetHSL(0.02, 0.05, 0.12);
            cm.needsUpdate = true;
            return cm;
          });
          c.material = Array.isArray(c.material) ? next : next[0];
        }
      });
      const box3 = new THREE.Box3().setFromObject(wall);
      const size = box3.getSize(new THREE.Vector3());
      const sx = size.x > 0.01 ? width / size.x : 1;
      const sy = size.y > 0.01 ? height / size.y : 1;
      wall.scale.set(sx, sy, sx);
      wall.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(wall);
      const center = box2.getCenter(new THREE.Vector3());
      wall.position.set(-center.x, -box2.min.y, depth - 0.02 - (box2.max.z - center.z));
      room.add(wall);
      usedKitWall = true;
    }
  } catch (_) {
    /* fall through */
  }
  if (!usedKitWall) {
    room.add(box(width, height, wallT, plaster, 0, height * 0.5, depth));
  }

  // ——— Near-glass silhouette (small Z) so street view instantly reads “room” ———
  // Large plant just inside the pane (−Z opening ≈ z≈0).
  room.add(box(0.38, 0.28, 0.38, pot, 1.15, 0.18, 0.55));
  room.add(box(0.48, 0.85, 0.48, plant, 1.15, 0.72, 0.55));
  room.add(box(0.22, 0.35, 0.22, plant, 1.15, 1.25, 0.55));
  // Sofa face-on near the window (readable mass through glass).
  room.add(box(2.0, 0.48, 0.72, fabric, -0.15, 0.32, 0.95));
  room.add(box(2.0, 0.42, 0.16, fabric, -0.15, 0.66, 1.22));
  room.add(box(0.16, 0.42, 0.62, fabric, -1.07, 0.58, 0.95));
  room.add(box(0.16, 0.42, 0.62, fabric, 0.77, 0.58, 0.95));
  room.add(box(0.7, 0.14, 0.4, cushion, -0.15, 0.6, 0.85));
  // Coffee table mid-room
  room.add(box(0.9, 0.06, 0.5, wood, -0.1, 0.4, 1.7));
  room.add(box(0.06, 0.36, 0.06, wood, -0.42, 0.18, 1.55));
  room.add(box(0.06, 0.36, 0.06, wood, 0.22, 0.18, 1.55));
  room.add(box(0.06, 0.36, 0.06, wood, -0.42, 0.18, 1.85));
  room.add(box(0.06, 0.36, 0.06, wood, 0.22, 0.18, 1.85));
  // Floor lamp (bright shade) — left near glass
  room.add(box(0.08, 1.2, 0.08, wood, -1.35, 0.6, 0.7));
  room.add(box(0.48, 0.14, 0.48, lampShade, -1.35, 1.28, 0.7));
  // Picture on side wall (closer to window)
  room.add(box(0.02, 0.5, 0.6, wood, -width * 0.5 + 0.06, 1.55, 1.2));
  room.add(box(0.01, 0.42, 0.52, std(0xffe0a8, { emissive: 0xffc878, emissiveIntensity: 0.5 }), -width * 0.5 + 0.08, 1.55, 1.2));

  // Strong fill — outdoor ACES eats weak interior lights.
  const fill = new THREE.PointLight(0xfff2e0, 4.5, 10, 1.4);
  fill.position.set(0, height * 0.75, 1.1);
  room.add(fill);
  const windowFill = new THREE.PointLight(0xfff8f0, 2.8, 6, 1.6);
  windowFill.position.set(0, height * 0.55, 0.35);
  room.add(windowFill);
  const lamp = new THREE.PointLight(0xffe4b5, 1.8, 5, 2);
  lamp.position.set(-1.35, 1.2, 0.7);
  room.add(lamp);

  room.userData.phase = 1;
  room.userData.kitWall = usedKitWall;
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
