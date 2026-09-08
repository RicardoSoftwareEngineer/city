/**
 * Procedural Land Rover Defender 90 — Box / Cylinder / Plane only.
 * Visual comparison vs porsche.glb and the crude box placeholder.
 *
 * LIMITATIONS (honest — not attempted / not faked):
 * - No curved wheel arches: square gaps between fender / door / quarter panels.
 * - No wraparound windshield: single flat pane, slight rake only.
 * - No grille mesh / badges / tire tread / mirrors detail beyond boxes.
 * - No interior, no seats, no steering wheel.
 * - No spare-wheel cover artwork; rear spare is a plain cylinder.
 * - Glass is opacity-only MeshPhysicalMaterial (no transmission) — cheaper on Windows.
 * - Wheels do not spin/steer with physics (same as box placeholder; glTF only).
 * - Organic fender lips / rolled edges skipped — hard box panels.
 */

import * as THREE from 'three';
import { PORSCHE_TARGET_LENGTH } from '../world/RoadDimensions.js';

/**
 * @returns {THREE.Group} named procedural-defender with named child meshes.
 */
export function createProceduralDefender() {
  const root = new THREE.Group();
  root.name = 'procedural-defender';

  // ── Materials (solid + clearcoat; no body textures) ─────────────────────
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x2f4a3c, // Keswick-ish green
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.75,
    metalness: 0.15
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x121212,
    roughness: 0.92,
    metalness: 0.0
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x87a0b4,
    roughness: 0.08,
    metalness: 0.0,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
    // transmission omitted — Windows cost; see LIMITATIONS
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xc8c8c8,
    roughness: 0.28,
    metalness: 0.85
  });
  const lightFront = new THREE.MeshStandardMaterial({
    color: 0xffffee,
    emissive: 0xfff5d6,
    emissiveIntensity: 0.85,
    roughness: 0.4
  });
  const lightRear = new THREE.MeshStandardMaterial({
    color: 0xaa2222,
    emissive: 0xff2200,
    emissiveIntensity: 0.55,
    roughness: 0.5
  });

  const add = (name, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    root.add(mesh);
    return mesh;
  };

  // Native Defender 90-ish meters; +Z forward, Y up, X right.
  // Length ≈ 3.94, width ≈ 1.79, height ≈ 1.97; then uniform scale.
  const W = 1.79;
  const halfW = W / 2;

  // ── Wheels (cylinders) ──────────────────────────────────────────────────
  const wheelR = 0.40;
  const wheelT = 0.27;
  const halfTrack = 0.78;
  const frontZ = 1.18;
  const rearZ = -1.18;
  const wheelY = wheelR;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelT, 16);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.42, wheelR * 0.42, wheelT + 0.02, 12);

  for (const [side, x] of [['L', -halfTrack], ['R', halfTrack]]) {
    for (const [axle, z] of [['F', frontZ], ['R', rearZ]]) {
      add(`wheel_${side}${axle}`, wheelGeo, rubber, x, wheelY, z, 0, 0, Math.PI / 2);
      add(`hub_${side}${axle}`, hubGeo, chrome, x, wheelY, z, 0, 0, Math.PI / 2);
    }
  }

  // ── Body panels (square arch gaps between fender / door / quarter) ──────
  const bodyBottom = wheelR + 0.08; // above tire top slightly for clearance look
  const sillH = 0.38;
  const sillY = bodyBottom + sillH / 2;

  // Front bumper
  add(
    'bumper_front',
    new THREE.BoxGeometry(W * 0.98, 0.16, 0.18),
    trim,
    0,
    bodyBottom + 0.10,
    1.90
  );

  // Front clip / grille block (flat — no mesh grille)
  add(
    'grille_block',
    new THREE.BoxGeometry(W * 0.72, 0.42, 0.10),
    trim,
    0,
    sillY + 0.28,
    1.82
  );

  // Hood (flat, slight step)
  add(
    'hood',
    new THREE.BoxGeometry(W * 0.92, 0.10, 1.05),
    paint,
    0,
    sillY + sillH / 2 + 0.28,
    1.22
  );

  // Front fenders (short Z — leave square gap over front wheels)
  const fenderH = 0.55;
  const fenderY = bodyBottom + fenderH / 2 + 0.06;
  add(
    'fender_FL',
    new THREE.BoxGeometry(0.22, fenderH, 0.55),
    paint,
    -halfW + 0.11,
    fenderY,
    frontZ + 0.42
  );
  add(
    'fender_FR',
    new THREE.BoxGeometry(0.22, fenderH, 0.55),
    paint,
    halfW - 0.11,
    fenderY,
    frontZ + 0.42
  );

  // Door / mid body (between axles — square cutout ahead/behind)
  const doorLen = 1.55;
  const doorH = 0.72;
  const doorY = bodyBottom + doorH / 2 + 0.02;
  add(
    'body_door_L',
    new THREE.BoxGeometry(0.14, doorH, doorLen),
    paint,
    -halfW + 0.07,
    doorY,
    0.0
  );
  add(
    'body_door_R',
    new THREE.BoxGeometry(0.14, doorH, doorLen),
    paint,
    halfW - 0.07,
    doorY,
    0.0
  );
  // Floor / tub between doors
  add(
    'body_tub',
    new THREE.BoxGeometry(W * 0.88, 0.14, doorLen + 0.35),
    paint,
    0,
    bodyBottom + 0.12,
    0.05
  );
  // Lower bulk fill (reads as continuous tub from front)
  add(
    'body_lower_front',
    new THREE.BoxGeometry(W * 0.86, 0.50, 0.85),
    paint,
    0,
    sillY + 0.06,
    1.35
  );

  // Rear quarters
  add(
    'quarter_RL',
    new THREE.BoxGeometry(0.22, fenderH + 0.12, 0.70),
    paint,
    -halfW + 0.11,
    fenderY + 0.04,
    rearZ - 0.35
  );
  add(
    'quarter_RR',
    new THREE.BoxGeometry(0.22, fenderH + 0.12, 0.70),
    paint,
    halfW - 0.11,
    fenderY + 0.04,
    rearZ - 0.35
  );

  // Rear body / tailgate face
  add(
    'tailgate',
    new THREE.BoxGeometry(W * 0.90, 0.95, 0.12),
    paint,
    0,
    doorY + 0.12,
    -1.88
  );
  add(
    'bumper_rear',
    new THREE.BoxGeometry(W * 0.95, 0.14, 0.16),
    trim,
    0,
    bodyBottom + 0.08,
    -1.95
  );

  // ── Greenhouse (upright cabin) ──────────────────────────────────────────
  const cabinBottom = doorY + doorH / 2 - 0.05;
  const cabinH = 0.62;
  const cabinY = cabinBottom + cabinH / 2;
  const cabinLen = 1.55;
  const cabinZ = -0.35;

  // Side pillars / upper body sides
  add(
    'cabin_side_L',
    new THREE.BoxGeometry(0.10, cabinH, cabinLen),
    paint,
    -halfW + 0.12,
    cabinY,
    cabinZ
  );
  add(
    'cabin_side_R',
    new THREE.BoxGeometry(0.10, cabinH, cabinLen),
    paint,
    halfW - 0.12,
    cabinY,
    cabinZ
  );
  // A-pillar stubs (upright look)
  add(
    'pillar_A_L',
    new THREE.BoxGeometry(0.08, cabinH + 0.08, 0.10),
    paint,
    -halfW + 0.14,
    cabinY,
    cabinZ + cabinLen / 2 - 0.05
  );
  add(
    'pillar_A_R',
    new THREE.BoxGeometry(0.08, cabinH + 0.08, 0.10),
    paint,
    halfW - 0.14,
    cabinY,
    cabinZ + cabinLen / 2 - 0.05
  );
  // B/C rear cabin frame
  add(
    'pillar_rear',
    new THREE.BoxGeometry(W * 0.88, cabinH, 0.10),
    paint,
    0,
    cabinY,
    cabinZ - cabinLen / 2 + 0.05
  );

  // Roof (flat, slight overhang)
  add(
    'roof',
    new THREE.BoxGeometry(W * 0.94, 0.08, cabinLen + 0.25),
    paint,
    0,
    cabinY + cabinH / 2 + 0.02,
    cabinZ - 0.05
  );
  // Roof rails (thin boxes)
  add(
    'rail_L',
    new THREE.BoxGeometry(0.04, 0.04, cabinLen * 0.85),
    trim,
    -halfW + 0.28,
    cabinY + cabinH / 2 + 0.08,
    cabinZ
  );
  add(
    'rail_R',
    new THREE.BoxGeometry(0.04, 0.04, cabinLen * 0.85),
    trim,
    halfW - 0.28,
    cabinY + cabinH / 2 + 0.08,
    cabinZ
  );

  // ── Glass (flat panes) ──────────────────────────────────────────────────
  const windRake = -0.12; // slight tilt (rad) — still a flat pane
  add(
    'glass_windshield',
    new THREE.PlaneGeometry(W * 0.78, cabinH * 0.85),
    glass,
    0,
    cabinY + 0.02,
    cabinZ + cabinLen / 2 - 0.02,
    windRake,
    0,
    0
  );
  // Side glass L/R
  add(
    'glass_side_L',
    new THREE.PlaneGeometry(cabinLen * 0.72, cabinH * 0.70),
    glass,
    -halfW + 0.06,
    cabinY + 0.02,
    cabinZ + 0.05,
    0,
    Math.PI / 2,
    0
  );
  add(
    'glass_side_R',
    new THREE.PlaneGeometry(cabinLen * 0.72, cabinH * 0.70),
    glass,
    halfW - 0.06,
    cabinY + 0.02,
    cabinZ + 0.05,
    0,
    -Math.PI / 2,
    0
  );
  // Rear glass (flat on tailgate upper)
  add(
    'glass_rear',
    new THREE.PlaneGeometry(W * 0.70, cabinH * 0.55),
    glass,
    0,
    cabinY + 0.05,
    -1.885,
    0,
    Math.PI,
    0
  );

  // ── Lights (tiny emissive boxes / cylinders) ────────────────────────────
  const lampR = 0.09;
  add(
    'headlight_L',
    new THREE.CylinderGeometry(lampR, lampR, 0.06, 12),
    lightFront,
    -0.48,
    sillY + 0.22,
    1.88,
    Math.PI / 2,
    0,
    0
  );
  add(
    'headlight_R',
    new THREE.CylinderGeometry(lampR, lampR, 0.06, 12),
    lightFront,
    0.48,
    sillY + 0.22,
    1.88,
    Math.PI / 2,
    0,
    0
  );
  add(
    'taillight_L',
    new THREE.BoxGeometry(0.14, 0.10, 0.05),
    lightRear,
    -0.62,
    doorY + 0.15,
    -1.95
  );
  add(
    'taillight_R',
    new THREE.BoxGeometry(0.14, 0.10, 0.05),
    lightRear,
    0.62,
    doorY + 0.15,
    -1.95
  );

  // Side mirrors (boxes — no organic arm)
  add(
    'mirror_L',
    new THREE.BoxGeometry(0.08, 0.10, 0.14),
    trim,
    -halfW - 0.06,
    cabinY + 0.05,
    cabinZ + cabinLen / 2 - 0.15
  );
  add(
    'mirror_R',
    new THREE.BoxGeometry(0.08, 0.10, 0.14),
    trim,
    halfW + 0.06,
    cabinY + 0.05,
    cabinZ + cabinLen / 2 - 0.15
  );

  // Rear spare (plain cylinder on tailgate)
  add(
    'spare_wheel',
    new THREE.CylinderGeometry(0.34, 0.34, 0.16, 14),
    rubber,
    0.15,
    doorY + 0.05,
    -2.02,
    0,
    0,
    Math.PI / 2
  );
  add(
    'spare_hub',
    new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10),
    chrome,
    0.15,
    doorY + 0.05,
    -2.02,
    0,
    0,
    Math.PI / 2
  );

  // Scale measured length to PORSCHE_TARGET_LENGTH (same as glTF path).
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new THREE.Vector3());
  const length = Math.max(size.z, size.x);
  const scale = PORSCHE_TARGET_LENGTH / length;
  root.scale.setScalar(scale);

  // Recenter XZ; keep wheel bottoms near y=0 (chassis pose from physics).
  root.updateMatrixWorld(true);
  const centered = new THREE.Box3().setFromObject(root);
  const c = centered.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= centered.min.y;

  return root;
}
