/**
 * Freestanding apartment interior **sandbox** near Large_3 (≈171,30).
 *
 * Staging tool for piece-by-piece furniture layout — NOT the InstancedMesh
 * product bake (`roomTemplate.pushLoftPiece`). Each loft piece is a named
 * Object3D child with load-time upright normalization so tipped Z-up meshes
 * (chair) stand on the floor regardless of extract flags.
 *
 * MeshBasic only — no PointLight (Ultra night CPU).
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { LOFT_FURNITURE_URL } from './roomTemplate.js';

/** Cache-bust so browser/disk cache cannot keep a tipped extract. */
const LOFT_URL = `${LOFT_FURNITURE_URL}?v=apt-example-2`;

/** Large_3@171.00,30.00 east facade — sidewalk just outside glass. */
export const APT_EXAMPLE_DEFAULT = {
  // East face of block (x=171, z=30, rot=-π/2). Room open (−Z) → world +X.
  x: 174.6,
  y: 0,
  z: 30.0,
  yaw: -Math.PI / 2,
  facadeId: 'Large_3@171.00,30.00'
};

/**
 * Readable first layout (room local: glass≈z=0, depth +Z, width X).
 * Sofa faces window; coffee in front; chair angles in; plant near glass.
 */
const FIRST_LAYOUT = {
  sofa: { x: 0.05, y: 0, z: 2.05, yaw: Math.PI, scale: 1 },
  plant: { x: 1.35, y: 0, z: 0.45, yaw: 0.25, scale: 1 },
  coffee: { x: 0.0, y: 0, z: 1.1, yaw: 0, scale: 1 },
  console: { x: 1.45, y: 0, z: 1.85, yaw: -Math.PI / 2, scale: 1 },
  lamp: { x: -1.4, y: 0, z: 2.0, yaw: 0.15, scale: 1 },
  chair: { x: -1.15, y: 0, z: 1.2, yaw: Math.PI * 0.65, scale: 1 }
};

/** Fit targets (metres) after upright normalize — silhouette through open face. */
const FIT = {
  sofa: { targetHeight: 0.55, maxWidth: 1.85, maxDepth: 1.15 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55 },
  coffee: { targetHeight: 0.2, maxWidth: 0.95, maxDepth: 0.7 },
  console: { targetHeight: 0.5, maxWidth: 0.95, maxDepth: 0.5 },
  lamp: { targetHeight: 0.4, maxWidth: 0.5, maxDepth: 0.5 },
  chair: { targetHeight: 0.78, maxWidth: 0.8, maxDepth: 0.85 }
};

const ROOM = { width: 3.6, depth: 3.2, height: 2.75, wallT: 0.07 };

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function stdBasic(color, emissive, emissiveIntensity = 0.5) {
  const out = new THREE.Color(color).multiplyScalar(0.35);
  const e = new THREE.Color(emissive);
  out.r = Math.min(1, out.r + e.r * emissiveIntensity);
  out.g = Math.min(1, out.g + e.g * emissiveIntensity);
  out.b = Math.min(1, out.b + e.b * emissiveIntensity);
  return new THREE.MeshBasicMaterial({ color: out, toneMapped: true });
}

function basicFromLoft(src, cache) {
  const key =
    (src?.map?.uuid || 'nomap') +
    ':' +
    (src?.name || '') +
    ':' +
    (src?.color ? src.color.getHexString() : 'fff');
  if (cache.has(key)) return cache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  color.multiplyScalar(0.72);
  color.r = Math.min(1, color.r + 0.08);
  color.g = Math.min(1, color.g + 0.05);
  color.b = Math.min(1, color.b + 0.02);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `aptEx-${src.name}` : 'aptEx-mat',
    side: THREE.FrontSide,
    toneMapped: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 2;
  }
  cache.set(key, mat);
  return mat;
}

/**
 * Detect up axis from AABB, rotate so it becomes +Y, floor to y=0, center XZ.
 * Chair: tallest → Y (GLB still Z-tall). Flat pieces: shortest → Y.
 * Mutates `inner` in place (child of a pose Group).
 * @param {THREE.Object3D} inner
 * @param {string} [pieceName] loft piece id
 */
export function normalizePieceUpright(inner, pieceName = '') {
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.scale.set(1, 1, 1);
  inner.updateMatrixWorld(true);

  _box.setFromObject(inner);
  if (_box.isEmpty()) return inner;
  _box.getSize(_size);

  const sx = Math.max(_size.x, 1e-6);
  const sy = Math.max(_size.y, 1e-6);
  const sz = Math.max(_size.z, 1e-6);
  const dims = [
    { axis: 0, s: sx },
    { axis: 1, s: sy },
    { axis: 2, s: sz }
  ].sort((a, b) => a.s - b.s);

  // Flat (coffee/sofa): shortest → up. Chair: always tallest (extract still Z-tall).
  // Other standing pieces: keep authored Y-up (console/lamp/plant).
  let upAxis = 1;
  const name = pieceName || inner.name || '';
  if (name === 'chair' || name.startsWith('chair')) {
    upAxis = dims[2].axis;
  } else if (dims[0].s < dims[1].s * 0.5) {
    upAxis = dims[0].axis;
  } else if (sy < dims[2].s * 0.85 && (name === 'plant' || name.startsWith('plant'))) {
    upAxis = dims[2].axis;
  }

  if (upAxis === 0) {
    inner.rotation.z = Math.PI / 2; // +X → +Y
  } else if (upAxis === 2) {
    inner.rotation.x = -Math.PI / 2; // +Z → +Y
  }
  inner.updateMatrixWorld(true);

  _box.setFromObject(inner);
  if (!_box.isEmpty()) {
    _box.getCenter(_center);
    inner.position.x -= _center.x;
    inner.position.z -= _center.z;
    inner.position.y -= _box.min.y;
    inner.updateMatrixWorld(true);
  }
  return inner;
}

/**
 * @param {THREE.Object3D} obj
 * @param {{targetHeight:number,maxWidth?:number,maxDepth?:number}} fit
 */
function fitUniformScale(obj, fit) {
  _box.setFromObject(obj);
  _box.getSize(_size);
  const sx = Math.max(_size.x, 1e-4);
  const sy = Math.max(_size.y, 1e-4);
  const sz = Math.max(_size.z, 1e-4);
  return Math.min(
    fit.targetHeight / sy,
    (fit.maxWidth ?? fit.targetHeight * 2) / sx,
    (fit.maxDepth ?? fit.targetHeight * 2) / sz
  );
}

function buildShell() {
  const { width, depth, height, wallT } = ROOM;
  const g = new THREE.Group();
  g.name = 'apt-example-shell';

  const floorMat = stdBasic(0xa89070, 0x3a3020, 0.4);
  const ceilMat = stdBasic(0xfffaf3, 0xfff5e8, 0.55);
  const plaster = stdBasic(0xfff6ea, 0xffe8c8, 0.75);

  const addBox = (mat, w, h, d, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    g.add(m);
  };

  addBox(floorMat, width, wallT, depth, 0, wallT * 0.5, depth * 0.5, 'floor');
  addBox(ceilMat, width, wallT, depth, 0, height, depth * 0.5, 'ceiling');
  addBox(plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5, 'wall-x-');
  addBox(plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5, 'wall-x+');
  addBox(plaster, width, height, wallT, 0, height * 0.5, depth, 'wall-back');
  // Open face at z≈0 (no front wall) — street looks +Z into the room.

  return g;
}

/**
 * Build pose Group → upright inner (MeshBasic loft clone).
 * @param {THREE.Object3D} loftRoot
 * @param {string} name
 * @param {Map<string, THREE.MeshBasicMaterial>} matCache
 * @returns {THREE.Group|null}
 */
function extractPiece(loftRoot, name, matCache) {
  let src = null;
  loftRoot.traverse((o) => {
    if (o.name === name) src = o;
  });
  if (!src) {
    console.warn('[apt-example] loft piece missing', name);
    return null;
  }

  const inner = src.clone(true);
  inner.name = `${name}-mesh`;
  inner.traverse((c) => {
    if (!c.isMesh) return;
    const srcMats = Array.isArray(c.material) ? c.material : [c.material];
    const next = srcMats.map((m) => basicFromLoft(m, matCache));
    c.material = Array.isArray(c.material) ? next : next[0];
    c.castShadow = false;
    c.receiveShadow = false;
    c.frustumCulled = false;
  });

  normalizePieceUpright(inner, name);

  const pose = new THREE.Group();
  pose.name = name;
  pose.add(inner);

  const fit = FIT[name];
  const fitScale = fit ? fitUniformScale(pose, fit) : 1;
  // Scale the pose group uniformly; re-floor inner after so feet stay on y=0.
  pose.scale.setScalar(fitScale);
  pose.updateMatrixWorld(true);
  _box.setFromObject(pose);
  if (!_box.isEmpty()) {
    // Compensate floor in unscaled parent space: move inner in pose-local.
    inner.position.y -= _box.min.y / fitScale;
  }

  pose.userData.aptExampleFitScale = fitScale;
  pose.userData.aptExamplePose = { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
  return pose;
}

function addCoffeeLegs(parent, layout) {
  const mat = stdBasic(0x2a2a2a, 0x101010, 0.35);
  const leg = 0.04;
  const legH = 0.18;
  const span = 0.28;
  for (const [dx, dz] of [
    [-span, -span],
    [span, -span],
    [-span, span],
    [span, span]
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(leg, legH, leg), mat);
    m.name = 'coffee-leg';
    m.position.set(layout.x + dx, legH * 0.5, layout.z + dz);
    m.frustumCulled = false;
    parent.add(m);
  }
}

function applyPose(poseGroup, next) {
  const fit = poseGroup.userData.aptExampleFitScale || 1;
  poseGroup.position.set(next.x, next.y, next.z);
  poseGroup.rotation.set(0, next.yaw, 0);
  poseGroup.scale.setScalar(fit * next.scale);
  poseGroup.userData.aptExamplePose = { ...next };
  // Snap feet to floor when y is the default floor contact.
  if (next.y === 0) {
    poseGroup.updateMatrixWorld(true);
    _box.setFromObject(poseGroup);
    if (!_box.isEmpty()) {
      poseGroup.position.y -= _box.min.y;
      next.y = poseGroup.position.y;
      poseGroup.userData.aptExamplePose.y = next.y;
    }
  }
}

/**
 * @param {THREE.Object3D} parent
 * @param {Partial<typeof APT_EXAMPLE_DEFAULT>} [opts]
 */
export async function spawnAptExampleSandbox(parent, opts = {}) {
  const cfg = { ...APT_EXAMPLE_DEFAULT, ...opts };
  const root = new THREE.Group();
  root.name = 'apt-example-sandbox';
  root.position.set(cfg.x, cfg.y, cfg.z);
  root.rotation.y = cfg.yaw;

  root.add(buildShell());

  /** @type {Record<string, THREE.Object3D>} */
  const pieces = {};
  const matCache = new Map();

  const loftRoot = await loadGltf(LOFT_URL);
  if (loftRoot) {
    for (const name of Object.keys(FIRST_LAYOUT)) {
      const piece = extractPiece(loftRoot, name, matCache);
      if (!piece) continue;
      applyPose(piece, { ...FIRST_LAYOUT[name] });
      root.add(piece);
      pieces[name] = piece;
    }
    if (pieces.coffee) addCoffeeLegs(root, FIRST_LAYOUT.coffee);
  } else {
    console.warn('[apt-example] loft GLB failed — shell only');
  }

  parent.add(root);

  const api = {
    root,
    pieces,
    layout: { ...FIRST_LAYOUT },
    where:
      'Sidewalk east of Large_3@171,30 — stand ~x=178–182, z=28–32, look west (−X) into the open room. Free-flight near HUD CASA APTS Large_3 + street lamp/tree.',
    facadeId: cfg.facadeId,
    /**
     * Nudge one piece. y=0 keeps feet on floor. yaw in radians.
     * @param {string} name
     * @param {{x?:number,y?:number,z?:number,yaw?:number,scale?:number}} pose
     */
    setPose(name, pose = {}) {
      const p = pieces[name];
      if (!p) return false;
      const cur = p.userData.aptExamplePose || { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
      const next = {
        x: pose.x ?? cur.x,
        y: pose.y ?? 0,
        z: pose.z ?? cur.z,
        yaw: pose.yaw ?? cur.yaw,
        scale: pose.scale ?? cur.scale
      };
      applyPose(p, next);
      api.layout[name] = { ...p.userData.aptExamplePose };
      return true;
    },
    getPose(name) {
      const p = pieces[name];
      if (!p) return null;
      return { ...(p.userData.aptExamplePose || {}) };
    }
  };

  // Sync layout with floored y values from applyPose.
  for (const name of Object.keys(pieces)) {
    api.layout[name] = { ...pieces[name].userData.aptExamplePose };
  }

  console.info(
    '[apt-example] sandbox at',
    cfg.x.toFixed(1),
    cfg.z.toFixed(1),
    'pieces',
    Object.keys(pieces).join(',')
  );
  return api;
}
