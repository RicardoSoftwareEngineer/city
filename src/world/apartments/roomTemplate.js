/**
 * Apartment interior template — phase 1 (spec 05):
 * transparent glass view + MegaKit-adjacent materials (Brick_InteriorWall +
 * Standard props). Shared clone per unit. Quality grows “pouco a pouco”.
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { downtown } from '../downtownSrc.js';

let cached = null;

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

/**
 * Room local space: opening faces −Z (street / glass). Depth into +Z.
 * Async so we can pull Brick_InteriorWall from the downtown kit.
 */
export async function createApartmentRoom() {
  if (cached) return cached.clone(true);

  const room = new THREE.Group();
  room.name = 'apartment-room';

  const depth = 4.2;
  const width = 3.6;
  const height = 2.75;
  const wallT = 0.07;

  const floorMat = std(0x8b7355, { roughness: 0.85 }); // wood-ish
  const ceilMat = std(0xf5f0e8, { roughness: 0.95 });
  const plaster = std(0xe8dfd0, { roughness: 0.9 });
  const fabric = std(0x3b4a6b, { roughness: 0.9 });
  const wood = std(0x6b4423, { roughness: 0.7 });
  const lampShade = std(0xfff4d6, { roughness: 0.6, emissive: 0xffe4a8, emissiveIntensity: 0.35 });
  const plant = std(0x2f6b3a, { roughness: 0.85 });
  const pot = std(0x7c6a58, { roughness: 0.8 });

  room.add(box(width, wallT, depth, floorMat, 0, 0, depth * 0.5));
  room.add(box(width, wallT, depth, ceilMat, 0, height, depth * 0.5));

  // Side walls (plaster). Back wall prefers MegaKit brick interior piece.
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
        }
      });
      // Fit kit wall as back wall (opening still −Z)
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

  // Furniture — still procedural, Standard materials (phase 1)
  // Sofa
  room.add(box(1.6, 0.42, 0.62, fabric, 0, 0.28, depth * 0.78));
  room.add(box(1.6, 0.38, 0.14, fabric, 0, 0.58, depth * 0.78 + 0.22));
  room.add(box(0.14, 0.38, 0.55, fabric, -0.73, 0.52, depth * 0.78));
  room.add(box(0.14, 0.38, 0.55, fabric, 0.73, 0.52, depth * 0.78));
  // Coffee table
  room.add(box(0.85, 0.06, 0.5, wood, 0, 0.38, depth * 0.48));
  room.add(box(0.06, 0.34, 0.06, wood, -0.32, 0.17, depth * 0.48 - 0.15));
  room.add(box(0.06, 0.34, 0.06, wood, 0.32, 0.17, depth * 0.48 - 0.15));
  room.add(box(0.06, 0.34, 0.06, wood, -0.32, 0.17, depth * 0.48 + 0.15));
  room.add(box(0.06, 0.34, 0.06, wood, 0.32, 0.17, depth * 0.48 + 0.15));
  // Floor lamp
  room.add(box(0.08, 1.15, 0.08, wood, -1.15, 0.58, depth * 0.62));
  room.add(box(0.42, 0.12, 0.42, lampShade, -1.15, 1.22, depth * 0.62));
  // Plant
  room.add(box(0.28, 0.22, 0.28, pot, 1.2, 0.14, depth * 0.32));
  room.add(box(0.32, 0.55, 0.32, plant, 1.2, 0.5, depth * 0.32));
  // Picture frame on side wall
  room.add(box(0.02, 0.45, 0.55, wood, -width * 0.5 + 0.06, 1.5, depth * 0.45));
  room.add(box(0.01, 0.38, 0.48, std(0xd4c4a8), -width * 0.5 + 0.08, 1.5, depth * 0.45));

  const fill = new THREE.PointLight(0xfff1e0, 1.35, 8, 1.8);
  fill.position.set(0, height * 0.72, depth * 0.4);
  room.add(fill);
  const lamp = new THREE.PointLight(0xffe4b5, 0.55, 4, 2);
  lamp.position.set(-1.15, 1.15, depth * 0.62);
  room.add(lamp);

  room.userData.phase = 1;
  room.userData.kitWall = usedKitWall;
  cached = room;
  return room.clone(true);
}

/** Fabric-like curtain (outside glass). Visible when closed; opens after load. */
export function createCurtain(width, height) {
  const w = Math.max(width, 0.5) * 1.12;
  const h = Math.max(height, 0.5) * 1.12;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5b21b6,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.97,
    depthTest: true,
    depthWrite: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'apartment-curtain';
  mesh.renderOrder = 40;
  mesh.frustumCulled = false;
  mesh.geometry.translate(0, -h * 0.5, 0);
  mesh.position.y = Math.max(height, 0.5) * 0.5;
  mesh.userData.baseHeight = Math.max(height, 0.5);
  return mesh;
}

/** @deprecated Phase 1: opaque reveal removed — real glass + 3D room. */
export function createRevealPlane() {
  return null;
}
