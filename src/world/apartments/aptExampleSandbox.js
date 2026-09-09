/**
 * Freestanding apartment interior **sandbox** on asphalt near Large_3 (≈171,30).
 *
 * Collaborative staging: empty shell on the marked street corner + labeled
 * loft-furniture catalog on the road. Click or **drag** a catalog sample onto
 * the room floor (or call `addFromCatalog`) to place a piece; drag in-room
 * pieces to slide on the floor. While dragging, **mouse wheel** raises/lowers
 * Y (scroll up → raise; clamps ~0–2.5 m). NOT the InstancedMesh product bake
 * (`roomTemplate.pushLoftPiece`).
 *
 * MeshBasic only — no PointLight (Ultra night CPU).
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { ASPHALT_SURFACE_Y } from '../RoadDimensions.js';
import { LOFT_FURNITURE_URL } from './roomTemplate.js';

/** Cache-bust so browser/disk cache cannot keep a tipped extract. */
const LOFT_URL = `${LOFT_FURNITURE_URL}?v=apt-example-4`;

/**
 * Large_3@171,30 east facade; green-rect corner on N–S asphalt (street x≈180).
 * Open face south (yaw=π) so approach looking north (~339°) sees into the room.
 * Catalog marches north (−Z) along the dashed lane (green arrows).
 */
export const APT_EXAMPLE_DEFAULT = {
  x: 182.0,
  y: ASPHALT_SURFACE_Y + 0.2,
  z: 22.0,
  yaw: Math.PI,
  facadeId: 'Large_3@171.00,30.00'
};

/** Catalog order along the street strip (south → north = −Z). */
export const CATALOG_NAMES = ['sofa', 'plant', 'coffee', 'console', 'lamp', 'chair'];

/**
 * Default in-room slots (room local: glass≈z=0, depth +Z, width X).
 * Used when `addFromCatalog` places a piece the first time (click fallback).
 */
const DEFAULT_SLOTS = {
  sofa: { x: 0.05, y: 0, z: 2.05, yaw: Math.PI, scale: 1 },
  plant: { x: 1.35, y: 0, z: 0.45, yaw: 0.25, scale: 1 },
  coffee: { x: 0.0, y: 0, z: 1.1, yaw: 0, scale: 1 },
  console: { x: 1.45, y: 0, z: 1.85, yaw: -Math.PI / 2, scale: 1 },
  lamp: { x: -1.4, y: 0, z: 2.0, yaw: 0.15, scale: 1 },
  chair: { x: -1.15, y: 0, z: 1.2, yaw: Math.PI * 0.65, scale: 1 }
};

/** World-space street samples: lane near x=179.5, stepping north (−Z). */
const CATALOG_STREET = {
  x: 179.5,
  z0: 17.0,
  dz: -2.8,
  yaw: Math.PI * 0.15
};

/**
 * Fit targets (metres) after upright normalize — silhouette through open face.
 * Sofa footprint is wide/deep in the GLB; keep maxDepth generous so uniform
 * scale does not pancake height.
 */
const FIT = {
  sofa: { targetHeight: 0.65, maxWidth: 2.0, maxDepth: 1.55 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55 },
  coffee: { targetHeight: 0.2, maxWidth: 0.95, maxDepth: 0.7 },
  console: { targetHeight: 0.5, maxWidth: 0.95, maxDepth: 0.5 },
  lamp: { targetHeight: 0.4, maxWidth: 0.5, maxDepth: 0.5 },
  chair: { targetHeight: 0.78, maxWidth: 0.8, maxDepth: 0.85 }
};

const ROOM = { width: 3.6, depth: 3.2, height: 2.75, wallT: 0.07 };

/** Pointer move (px²) before a press becomes a furniture drag. */
const DRAG_THRESH_SQ = 64;

/** Drag lift: scroll up (negative deltaY on Windows/macOS) → raise. */
const DRAG_Y_MIN = 0;
const DRAG_Y_MAX = 2.5;
/** Metres per wheel deltaY unit (≈0.2 m per typical 100-unit notch). */
const DRAG_Y_WHEEL_SCALE = 0.002;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _floorPlane = new THREE.Plane();
const _hitPoint = new THREE.Vector3();
const _localHit = new THREE.Vector3();
const _floorNormal = new THREE.Vector3(0, 1, 0);

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
    // Loft GLB mats are DoubleSide; FrontSide + inverted tops → black pancake.
    side: THREE.DoubleSide,
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
 * Chair: tallest → Y (GLB still Z-tall). Coffee: shortest → Y (tabletop).
 * Sofa: keep authored Y-up (never flat-heuristic reorient).
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

  let upAxis = 1;
  const name = pieceName || inner.name || '';
  if (name === 'chair' || name.startsWith('chair')) {
    // Extract can still read Z-tall — tallest → up.
    upAxis = dims[2].axis;
  } else if (name === 'sofa' || name.startsWith('sofa')) {
    // GLB sofa AABB ~[2.74, 1.06, 2.83] floored Y-up. The generic
    // "shortest → up" flat path is a no-op today but must not reorient an
    // L-sofa if AABB jitter ever swaps axes.
    upAxis = 1;
  } else if (name === 'coffee' || name.startsWith('coffee')) {
    // Thin tabletop: shortest → up.
    upAxis = dims[0].axis;
  } else if (sy < dims[2].s * 0.85 && (name === 'plant' || name.startsWith('plant'))) {
    upAxis = dims[2].axis;
  }
  // console / lamp / other: keep authored Y-up.

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
  pose.userData.aptCatalogName = name;
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

function clearCoffeeLegs(parent) {
  const doomed = [];
  parent.traverse((c) => {
    if (c.name === 'coffee-leg') doomed.push(c);
  });
  for (const m of doomed) m.parent?.remove(m);
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

/** Floating label sprite above a catalog sample. */
function makeLabelSprite(text) {
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.beginPath();
  // roundRect may be missing in older engines — manual path
  const r = 12;
  ctx.moveTo(r, 4);
  ctx.lineTo(w - r, 4);
  ctx.quadraticCurveTo(w - 4, 4, w - 4, r);
  ctx.lineTo(w - 4, h - r);
  ctx.quadraticCurveTo(w - 4, h - 4, w - r, h - 4);
  ctx.lineTo(r, h - 4);
  ctx.quadraticCurveTo(4, h - 4, 4, h - r);
  ctx.lineTo(4, r);
  ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#ecfdf5';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      depthWrite: false,
      transparent: true
    })
  );
  spr.scale.set(1.6, 0.4, 1);
  spr.position.y = 1.45;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `label-${text}`;
  spr.userData.aptCatalogName = text;
  return spr;
}

function clampRoomXZ(x, z) {
  const margin = 0.35;
  const halfW = ROOM.width * 0.5 - margin;
  return {
    x: Math.max(-halfW, Math.min(halfW, x)),
    z: Math.max(margin, Math.min(ROOM.depth - margin, z))
  };
}

/**
 * @param {THREE.Object3D} parent
 * @param {Partial<typeof APT_EXAMPLE_DEFAULT> & {
 *   camera?: THREE.Camera,
 *   domElement?: HTMLElement,
 *   lookControls?: { setLookBlocked?: (b: boolean) => void },
 *   mouseInput?: { setDragBlocked?: (b: boolean) => void, enabled?: boolean }
 * }} [opts]
 */
export async function spawnAptExampleSandbox(parent, opts = {}) {
  const cfg = { ...APT_EXAMPLE_DEFAULT, ...opts };
  const root = new THREE.Group();
  root.name = 'apt-example-sandbox';
  root.position.set(cfg.x, cfg.y, cfg.z);
  root.rotation.y = cfg.yaw;

  const roomGroup = new THREE.Group();
  roomGroup.name = 'apt-example-room';
  roomGroup.add(buildShell());
  root.add(roomGroup);

  /** Street catalog lives in world space (sibling of room root orientation). */
  const catalogGroup = new THREE.Group();
  catalogGroup.name = 'apt-example-catalog';
  parent.add(catalogGroup);

  /** @type {Record<string, THREE.Object3D>} */
  const pieces = {};
  /** @type {Record<string, THREE.Object3D>} */
  const catalog = {};
  const matCache = new Map();
  /** @type {THREE.Object3D|null} */
  let loftRoot = null;

  loftRoot = await loadGltf(LOFT_URL);
  if (loftRoot) {
    for (let i = 0; i < CATALOG_NAMES.length; i++) {
      const name = CATALOG_NAMES[i];
      const sample = extractPiece(loftRoot, name, matCache);
      if (!sample) continue;
      sample.name = `catalog-${name}`;
      sample.userData.aptCatalogName = name;
      sample.userData.aptIsCatalog = true;
      const wx = CATALOG_STREET.x;
      const wz = CATALOG_STREET.z0 + i * CATALOG_STREET.dz;
      sample.position.set(wx, ASPHALT_SURFACE_Y + 0.05, wz);
      sample.rotation.y = CATALOG_STREET.yaw;
      // Re-floor on asphalt after world place.
      sample.updateMatrixWorld(true);
      _box.setFromObject(sample);
      if (!_box.isEmpty()) {
        sample.position.y -= _box.min.y - (ASPHALT_SURFACE_Y + 0.02);
      }
      sample.add(makeLabelSprite(name));
      catalogGroup.add(sample);
      catalog[name] = sample;
    }
  } else {
    console.warn('[apt-example] loft GLB failed — shell only');
  }

  parent.add(root);

  const layout = {};

  const api = {
    root,
    roomGroup,
    catalogGroup,
    pieces,
    catalog,
    layout,
    catalogNames: [...CATALOG_NAMES],
    where:
      'Asphalt corner SE of Large_3@171,30 — room ~x=182,z=22 open south; catalog on lane x≈179.5 z=17→3. Free-flight near HUD CASA APTS Large_3, look ~339°. Drag catalog→room or drag in-room pieces; while dragging, scroll wheel raises/lowers (scroll up→raise, 0–2.5 m); click still adds.',
    facadeId: cfg.facadeId,
    /**
     * Clone a loft piece into the empty room at its default slot (or override).
     * Replaces any existing piece of the same name.
     * @param {string} name
     * @param {{x?:number,y?:number,z?:number,yaw?:number,scale?:number}} [pose]
     */
    addFromCatalog(name, pose = {}) {
      if (!loftRoot) {
        console.warn('[apt-example] no loft root — cannot add', name);
        return false;
      }
      if (!DEFAULT_SLOTS[name] && !CATALOG_NAMES.includes(name)) {
        console.warn('[apt-example] unknown catalog piece', name);
        return false;
      }
      // Remove prior instance of same name.
      if (pieces[name]) {
        roomGroup.remove(pieces[name]);
        delete pieces[name];
        delete layout[name];
        if (name === 'coffee') clearCoffeeLegs(roomGroup);
      }
      const piece = extractPiece(loftRoot, name, matCache);
      if (!piece) return false;
      piece.userData.aptIsCatalog = false;
      piece.userData.aptInRoom = true;
      const slot = { ...(DEFAULT_SLOTS[name] || { x: 0, y: 0, z: 1.2, yaw: 0, scale: 1 }), ...pose };
      applyPose(piece, slot);
      roomGroup.add(piece);
      pieces[name] = piece;
      layout[name] = { ...piece.userData.aptExamplePose };
      if (name === 'coffee') {
        clearCoffeeLegs(roomGroup);
        addCoffeeLegs(roomGroup, layout[name]);
      }
      console.info('[apt-example] added', name, layout[name]);
      return true;
    },
    /**
     * Nudge one in-room piece. y=0 keeps feet on floor; y>0 is lift (metres).
     * yaw in radians.
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
      layout[name] = { ...p.userData.aptExamplePose };
      if (name === 'coffee') {
        clearCoffeeLegs(roomGroup);
        addCoffeeLegs(roomGroup, layout[name]);
      }
      return true;
    },
    getPose(name) {
      const p = pieces[name];
      if (!p) return null;
      return { ...(p.userData.aptExamplePose || {}) };
    },
    /** Remove all furniture from the room (catalog stays on the street). */
    clearRoom() {
      for (const name of Object.keys(pieces)) {
        roomGroup.remove(pieces[name]);
        delete pieces[name];
        delete layout[name];
      }
      clearCoffeeLegs(roomGroup);
      return true;
    },
    getPoseRoom() {
      return { x: cfg.x, y: cfg.y, z: cfg.z, yaw: cfg.yaw };
    }
  };

  // ── Pointer: click-to-add + drag catalog→room + drag in-room slide ──
  const camera = opts.camera || null;
  const dom = opts.domElement || null;
  const lookControls = opts.lookControls || null;
  const mouseInput = opts.mouseInput || null;

  /** @type {null | { kind:'catalog'|'room', name:string, downX:number, downY:number, dragging:boolean, yaw:number, liftY:number }} */
  let gesture = null;
  /** @type {THREE.Object3D|null} ghost preview while dragging from catalog */
  let ghost = null;

  function setLookBlocked(blocked) {
    lookControls?.setLookBlocked?.(blocked);
    mouseInput?.setDragBlocked?.(blocked);
  }

  function clampDragY(y) {
    return Math.max(DRAG_Y_MIN, Math.min(DRAG_Y_MAX, y));
  }

  /** y=0 → floor-snap path in applyPose; else absolute lift. */
  function poseYFromLift(liftY) {
    const y = clampDragY(liftY);
    return y <= 1e-4 ? 0 : y;
  }

  function applyDragPose(name, kind, local) {
    if (!local) return;
    const y = poseYFromLift(gesture.liftY);
    if (kind === 'catalog') {
      const g = ensureGhost(name);
      if (!g) return;
      applyPose(g, { x: local.x, y, z: local.z, yaw: gesture.yaw, scale: 1 });
      return;
    }
    api.setPose(name, { x: local.x, y, z: local.z, yaw: gesture.yaw });
  }

  function disposeGhost() {
    if (!ghost) return;
    roomGroup.remove(ghost);
    ghost = null;
  }

  function catalogNameFromHit(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.aptCatalogName && o.userData?.aptIsCatalog) {
        return o.userData.aptCatalogName;
      }
      if (o.userData?.aptCatalogName && catalog[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (typeof o.name === 'string' && o.name.startsWith('catalog-')) {
        return o.name.slice('catalog-'.length);
      }
      if (typeof o.name === 'string' && o.name.startsWith('label-')) {
        return o.name.slice('label-'.length);
      }
      o = o.parent;
    }
    return null;
  }

  function roomPieceNameFromHit(obj) {
    let o = obj;
    while (o && o !== roomGroup) {
      if (o.userData?.aptInRoom && o.userData?.aptCatalogName && pieces[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (o.userData?.aptCatalogName && !o.userData?.aptIsCatalog && pieces[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (typeof o.name === 'string' && pieces[o.name] === o) return o.name;
      o = o.parent;
    }
    return null;
  }

  function eventToNdc(ev) {
    const rect = (dom || ev.target)?.getBoundingClientRect?.() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** Ray → room-local floor xz, or null if miss / outside. */
  function rayRoomFloorLocal() {
    if (!camera) return null;
    // Floor plane through room local y=0 (feet), in world space.
    roomGroup.updateMatrixWorld(true);
    const worldOrigin = roomGroup.localToWorld(new THREE.Vector3(0, 0, ROOM.depth * 0.5));
    _floorNormal.set(0, 1, 0).transformDirection(roomGroup.matrixWorld).normalize();
    _floorPlane.setFromNormalAndCoplanarPoint(_floorNormal, worldOrigin);
    if (!_raycaster.ray.intersectPlane(_floorPlane, _hitPoint)) return null;
    _localHit.copy(_hitPoint);
    roomGroup.worldToLocal(_localHit);
    // Accept hits roughly over the footprint (slightly past open face for drops).
    if (_localHit.x < -ROOM.width * 0.55 || _localHit.x > ROOM.width * 0.55) return null;
    if (_localHit.z < -0.35 || _localHit.z > ROOM.depth + 0.2) return null;
    return clampRoomXZ(_localHit.x, _localHit.z);
  }

  function ensureGhost(name) {
    if (ghost && ghost.userData.aptCatalogName === name) return ghost;
    disposeGhost();
    if (!loftRoot) return null;
    ghost = extractPiece(loftRoot, name, matCache);
    if (!ghost) return null;
    ghost.userData.aptIsCatalog = false;
    ghost.userData.aptGhost = true;
    // Clone mats so opacity does not dirty the shared loft cache / catalog.
    ghost.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const srcMats = Array.isArray(c.material) ? c.material : [c.material];
      const next = srcMats.map((m) => {
        const cm = m.clone();
        cm.transparent = true;
        cm.opacity = 0.72;
        cm.depthWrite = false;
        return cm;
      });
      c.material = Array.isArray(c.material) ? next : next[0];
    });
    roomGroup.add(ghost);
    return ghost;
  }

  function onPointerDown(ev) {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target?.closest?.('#hud, button, .hud-panel, #terrain-debug-readout, #camera-mode-btn')) {
      return;
    }
    if (!camera) return;

    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);

    // Prefer in-room piece, then catalog (so placed furniture is easy to grab).
    const roomHits = _raycaster.intersectObjects(roomGroup.children, true);
    for (const hit of roomHits) {
      if (hit.object?.userData?.aptGhost) continue;
      const name = roomPieceNameFromHit(hit.object);
      if (name) {
        const cur = pieces[name]?.userData?.aptExamplePose || DEFAULT_SLOTS[name] || {};
        gesture = {
          kind: 'room',
          name,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: cur.yaw ?? 0,
          liftY: clampDragY(cur.y ?? 0)
        };
        setLookBlocked(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }

    const catHits = _raycaster.intersectObjects(catalogGroup.children, true);
    for (const hit of catHits) {
      const name = catalogNameFromHit(hit.object);
      if (name) {
        const slot = DEFAULT_SLOTS[name] || { yaw: 0 };
        gesture = {
          kind: 'catalog',
          name,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: slot.yaw ?? 0,
          liftY: 0
        };
        setLookBlocked(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }
    // Miss — let free-flight orbit handle the gesture.
    gesture = null;
  }

  function onPointerMove(ev) {
    if (!gesture || !camera) return;
    const dx = ev.clientX - gesture.downX;
    const dy = ev.clientY - gesture.downY;
    if (!gesture.dragging) {
      if (dx * dx + dy * dy < DRAG_THRESH_SQ) return;
      gesture.dragging = true;
      setLookBlocked(true);
    }

    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);
    const local = rayRoomFloorLocal();

    if (gesture.kind === 'catalog') {
      if (!local) {
        disposeGhost();
        return;
      }
      applyDragPose(gesture.name, 'catalog', local);
      return;
    }

    if (gesture.kind === 'room' && local) {
      applyDragPose(gesture.name, 'room', local);
    }
  }

  /**
   * While furniture drag is active: wheel → lift Y (scroll up / negative deltaY → raise).
   * Consumes the event so free-flight fly-speed / follow zoom do not change.
   */
  function onWheel(ev) {
    if (!gesture || !camera) return;
    if (ev.target?.closest?.('#hud, button, .hud-panel, #terrain-debug-readout, #camera-mode-btn')) {
      return;
    }

    if (!gesture.dragging) {
      gesture.dragging = true;
      setLookBlocked(true);
    }

    // Windows/macOS: wheel up → deltaY < 0 → raise.
    gesture.liftY = clampDragY(gesture.liftY - ev.deltaY * DRAG_Y_WHEEL_SCALE);
    ev.preventDefault();
    ev.stopImmediatePropagation();

    // Re-apply at last pointer floor hit if possible; else room piece keeps xz.
    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);
    const local = rayRoomFloorLocal();
    if (gesture.kind === 'catalog') {
      if (local) applyDragPose(gesture.name, 'catalog', local);
      return;
    }
    if (gesture.kind === 'room') {
      const cur = pieces[gesture.name]?.userData?.aptExamplePose;
      const xz = local || (cur ? { x: cur.x, z: cur.z } : null);
      if (xz) applyDragPose(gesture.name, 'room', xz);
    }
  }

  function onPointerUp(ev) {
    if (!gesture) {
      setLookBlocked(false);
      return;
    }
    const g = gesture;
    gesture = null;

    const dx = ev.clientX - g.downX;
    const dy = ev.clientY - g.downY;
    const wasDrag = g.dragging || dx * dx + dy * dy >= DRAG_THRESH_SQ;

    if (g.kind === 'catalog') {
      if (!wasDrag) {
        // Short click fallback — default slot.
        disposeGhost();
        api.addFromCatalog(g.name);
      } else {
        eventToNdc(ev);
        if (camera) _raycaster.setFromCamera(_ndc, camera);
        const local = camera ? rayRoomFloorLocal() : null;
        disposeGhost();
        if (local) {
          api.addFromCatalog(g.name, {
            x: local.x,
            y: poseYFromLift(g.liftY),
            z: local.z,
            yaw: g.yaw,
            scale: 1
          });
        }
        // Drop outside room → cancel (no add).
      }
    } else if (g.kind === 'room' && wasDrag) {
      // Final floor snap already applied during move; refresh coffee legs etc.
      const pose = api.getPose(g.name);
      if (pose) api.setPose(g.name, pose);
    }

    setLookBlocked(false);
  }

  if (camera && typeof window !== 'undefined') {
    const target = dom || window;
    // Capture phase so we can consume furniture hits before free-flight look.
    target.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    // Capture + non-passive so height scroll wins over camera zoom / fly-speed.
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    api._unbindPick = () => {
      target.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('wheel', onWheel, { capture: true });
      disposeGhost();
      setLookBlocked(false);
    };
  }

  console.info(
    '[apt-example] sandbox at',
    cfg.x.toFixed(1),
    cfg.z.toFixed(1),
    'yaw',
    cfg.yaw.toFixed(2),
    'catalog',
    Object.keys(catalog).join(',') || '(none)',
    'room empty — click/drag street samples → room floor; drag in-room to slide; wheel while drag = height; addFromCatalog(name)'
  );
  return api;
}
