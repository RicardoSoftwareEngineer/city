/**
 * One reusable procedural apartment interior — deep enough to read through glass.
 * Shared template is cloned per loaded unit (spec 05).
 */

import * as THREE from 'three';

let cached = null;

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Room local space: opening faces −Z (toward the street / glass).
 * Depth extends into +Z (into the building).
 */
export function createApartmentRoom() {
  if (cached) return cached.clone(true);

  const room = new THREE.Group();
  room.name = 'apartment-room';

  const depth = 3.6;
  const width = 3.2;
  const height = 2.6;
  const wall = 0.08;

  // Floor / ceiling — light so they read through glass
  room.add(box(width, wall, depth, 0xa8b0bc, 0, 0, depth * 0.5));
  room.add(box(width, wall, depth, 0xf3f4f6, 0, height, depth * 0.5));

  // Back + side walls (leave −Z open toward glass) — warmer / brighter
  room.add(box(width, height, wall, 0xf0e6d4, 0, height * 0.5, depth));
  room.add(box(wall, height, depth, 0xe8dcc8, -width * 0.5, height * 0.5, depth * 0.5));
  room.add(box(wall, height, depth, 0xe8dcc8, width * 0.5, height * 0.5, depth * 0.5));

  // Props: sofa, table, lamp, plant
  room.add(box(1.4, 0.45, 0.55, 0x60a5fa, 0, 0.28, depth * 0.72));
  room.add(box(1.4, 0.35, 0.12, 0x1e40af, 0, 0.55, depth * 0.72 + 0.2));
  room.add(box(0.7, 0.08, 0.7, 0xb45309, 0.7, 0.4, depth * 0.4));
  room.add(box(0.08, 0.4, 0.08, 0x92400e, 0.7, 0.2, depth * 0.4));
  room.add(box(0.12, 0.9, 0.12, 0x57534e, -0.9, 0.5, depth * 0.55));
  room.add(box(0.35, 0.08, 0.35, 0xfef08a, -0.9, 0.95, depth * 0.55));
  room.add(box(0.25, 0.35, 0.25, 0x22c55e, 0.95, 0.25, depth * 0.25));
  room.add(box(0.2, 0.15, 0.2, 0xa8a29e, 0.95, 0.08, depth * 0.25));

  // Stronger interior fill so the room reads clearly through glass
  const fill = new THREE.PointLight(0xfff1e0, 2.0, 7, 1.6);
  fill.position.set(0, height * 0.75, depth * 0.45);
  room.add(fill);

  cached = room;
  return room.clone(true);
}

/** Bright magenta curtain — sits OUTSIDE the glass (local −Z) so facade reads from street. */
export function createCurtain(width, height) {
  const w = Math.max(width, 0.5) * 1.18;
  const h = Math.max(height, 0.5) * 1.18;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe879f9, // bright magenta / fuchsia
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'apartment-curtain';
  mesh.renderOrder = 40;
  mesh.frustumCulled = false;
  // Pivot at top so open anim shrinks downward.
  mesh.geometry.translate(0, -h * 0.5, 0);
  mesh.position.y = Math.max(height, 0.5) * 0.5;
  mesh.userData.baseHeight = Math.max(height, 0.5);
  return mesh;
}

/**
 * Warm “room glow” plane flush with the window from the outside.
 * Reads even when InstancedMesh glass sorting hides the 3D interior.
 */
export function createRevealPlane(width, height) {
  const w = Math.max(width, 0.5) * 1.08;
  const h = Math.max(height, 0.5) * 1.08;
  const geo = new THREE.PlaneGeometry(w, h);
  // Soft warm interior suggestion (lamp + wall tones)
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#fff7ed');
  g.addColorStop(0.35, '#fdba74');
  g.addColorStop(0.7, '#fbbf24');
  g.addColorStop(1, '#78350f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // Fake window panes / room depth hint
  ctx.fillStyle = 'rgba(30, 58, 138, 0.35)';
  ctx.fillRect(8, 28, 20, 14);
  ctx.fillRect(36, 28, 20, 14);
  ctx.fillStyle = 'rgba(255, 255, 200, 0.55)';
  ctx.beginPath();
  ctx.arc(32, 18, 6, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthTest: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'apartment-reveal';
  mesh.renderOrder = 35;
  mesh.frustumCulled = false;
  return mesh;
}
