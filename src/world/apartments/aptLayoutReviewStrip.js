/**
 * Staging review arena — 100 apartment layouts (floors 0–3) + living-wall
 * showcase (floors 4–5) in an inward-facing multi-floor ring on grass near
 * the wall paint showroom (does not crush showroom / candidates / show flat).
 * Open face (−Z local) → arena center. Debug: window.__cityAptLayouts
 */
import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import {
  LOFT_FURNITURE_URL,
  NOVOPO_FURNITURE_URL,
  KIT_FURNITURE_URL
} from './roomTemplate.js';
import { normalizePieceUpright } from './aptExampleSandbox.js';
import {
  LAYOUT_COUNT,
  LAYOUTS,
  ROOM,
  getLayout,
  fitFor,
  wallUrl,
  LIVING_WALL_IDS,
  LIVING_WALL_LABELS
} from './aptLayouts.js';

/** Arena center — west-south of wall showroom (~238,−42); free grass. */
export const REVIEW_ORIGIN = { x: 198, y: 0.02, z: -55 };
/** Floors × rooms/ring (6×25: floors 0–3 = 100 layouts; 4–5 = living showcase). */
export const REVIEW_FLOORS = 6;
export const REVIEW_LAYOUT_FLOORS = 4;
export const REVIEW_LIVING_FLOORS = 2;
export const REVIEW_PER_RING = 25;
export const LIVING_SHOWCASE_COUNT = REVIEW_LIVING_FLOORS * REVIEW_PER_RING;
/** Inner radius at open-face plane (m). Chord gap ~2.4 m at 25/ring. */
export const REVIEW_RADIUS = 24;
/** Vertical step between floors (m) — clears 2.75 m room + ceiling. */
export const REVIEW_FLOOR_STEP = 3.4;

const matCache = new Map();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

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
  color.multiplyScalar(1.12);
  color.r = Math.min(1, color.r + 0.1);
  color.g = Math.min(1, color.g + 0.08);
  color.b = Math.min(1, color.b + 0.05);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `aptLay-${src.name}` : 'aptLay-mat',
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

function loadWallAlbedo(id) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      wallUrl(id),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        tex.anisotropy = 2;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function wallBasic(map, wallId) {
  const color = new THREE.Color(0xfff6ea).multiplyScalar(1.05);
  return new THREE.MeshBasicMaterial({
    color,
    map: map || null,
    name: `aptLay-wall-${wallId}`,
    toneMapped: true
  });
}

function buildShell(wallMat) {
  const { width, depth, height, wallT } = ROOM;
  const g = new THREE.Group();
  g.name = 'apt-layout-shell';
  const floorMat = stdBasic(0xa89070, 0x3a3020, 0.4);
  const ceilMat = stdBasic(0xfffaf3, 0xfff5e8, 0.55);
  const addBox = (mat, w, h, d, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, z);
    m.frustumCulled = false;
    g.add(m);
  };
  addBox(floorMat, width, wallT, depth, 0, wallT * 0.5, depth * 0.5, 'floor');
  addBox(ceilMat, width, wallT, depth, 0, height, depth * 0.5, 'ceiling');
  addBox(wallMat, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5, 'wall-x-');
  addBox(wallMat, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5, 'wall-x+');
  addBox(wallMat, width, height, wallT, 0, height * 0.5, depth, 'wall-back');
  return g;
}

function makeLabelSprite(lines, opts = {}) {
  const w = opts.w || 640;
  const h = opts.h || 110;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = opts.stroke || '#fbbf24';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = opts.fg || '#fef3c7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.font =
      i === 0
        ? `bold ${opts.titleSize || 26}px system-ui,sans-serif`
        : `${opts.bodySize || 16}px system-ui,sans-serif`;
    ctx.fillText(lines[i], w / 2, (h / (lines.length + 1)) * (i + 1), w - 28);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  spr.scale.set(opts.scaleX || 3.6, opts.scaleY || 0.85, 1);
  spr.position.y = opts.y ?? 3.35;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  return spr;
}

function indexPieces(root, map) {
  if (!root) return;
  root.traverse((o) => {
    if (o.name && !map.has(o.name)) map.set(o.name, o);
  });
}

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

function extractPiece(pieceMap, name) {
  const src = pieceMap.get(name);
  if (!src) return null;
  const inner = src.clone(true);
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
  const fit = fitFor(name);
  const fitScale = fitUniformScale(pose, fit);
  pose.scale.setScalar(fitScale);
  pose.updateMatrixWorld(true);
  _box.setFromObject(pose);
  if (!_box.isEmpty()) inner.position.y -= _box.min.y / fitScale;
  pose.userData.fitScale = fitScale;
  return pose;
}

function placePiece(pose, layout) {
  const fit = pose.userData.fitScale || 1;
  pose.position.set(layout.x, layout.y ?? 0, layout.z);
  pose.rotation.set(0, layout.yaw ?? 0, 0);
  pose.scale.setScalar(fit * (layout.scale ?? 1));
  if ((layout.y ?? 0) === 0) {
    pose.updateMatrixWorld(true);
    _box.setFromObject(pose);
    if (!_box.isEmpty()) pose.position.y -= _box.min.y;
  }
}

/**
 * Pose for (floor, slot) on the multi-floor inward ring.
 * Open face (local −Z) points at REVIEW_ORIGIN; room extends radially out.
 * Odd floors stagger by half a slot for clearer sightlines from center.
 */
function padPoseFloorSlot(floor, slot) {
  const stagger = (floor % 2) * (Math.PI / REVIEW_PER_RING);
  const angle = (slot / REVIEW_PER_RING) * Math.PI * 2 + stagger;
  return {
    x: REVIEW_ORIGIN.x + Math.sin(angle) * REVIEW_RADIUS,
    y: REVIEW_ORIGIN.y + floor * REVIEW_FLOOR_STEP,
    z: REVIEW_ORIGIN.z + Math.cos(angle) * REVIEW_RADIUS,
    yaw: angle,
    floor,
    slot,
    angle
  };
}

/** Layout index i (0..99) → floors 0–3. */
function padPose(i) {
  return padPoseFloorSlot(Math.floor(i / REVIEW_PER_RING), i % REVIEW_PER_RING);
}

/** Living showcase index j (0..49) → floors 4–5. */
function livingPadPose(j) {
  const floor = REVIEW_LAYOUT_FLOORS + Math.floor(j / REVIEW_PER_RING);
  return padPoseFloorSlot(floor, j % REVIEW_PER_RING);
}

const SOFA_CANDIDATES = ['ph_sofa', 'sofa', 'mini_sofa', 'q_couch', 'l6_sofa'];
const TV_CANDIDATES = ['ph_tv'];

function pickFirstPiece(pieceMap, names) {
  for (const n of names) {
    if (pieceMap.has(n)) return n;
  }
  return null;
}

/**
 * @param {THREE.Object3D} cityGroup
 */
export async function spawnAptLayoutReviewStrip(cityGroup) {
  const root = new THREE.Group();
  root.name = 'apt-layout-review-strip';
  cityGroup.add(root);

  const pieceMap = new Map();
  const loft = await loadGltf(LOFT_FURNITURE_URL);
  await new Promise((r) => setTimeout(r, 0));
  const novo = await loadGltf(NOVOPO_FURNITURE_URL);
  await new Promise((r) => setTimeout(r, 0));
  let kit = null;
  try {
    kit = await loadGltf(KIT_FURNITURE_URL);
  } catch (e) {
    console.warn('[apt-layouts] kit missing', e);
  }
  indexPieces(loft, pieceMap);
  indexPieces(novo, pieceMap);
  indexPieces(kit, pieceMap);

  /** @type {Map<string, THREE.Texture|null>} */
  const wallMaps = new Map();
  const needWalls = [
    ...new Set([...LAYOUTS.map((l) => l.wall), ...LIVING_WALL_IDS])
  ];
  // Load in chunks to avoid hitch
  for (let i = 0; i < needWalls.length; i++) {
    const id = needWalls[i];
    wallMaps.set(id, await loadWallAlbedo(id));
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }

  const sofaName = pickFirstPiece(pieceMap, SOFA_CANDIDATES);
  const tvName = pickFirstPiece(pieceMap, TV_CANDIDATES);

  const entries = [];
  const livingEntries = [];
  const BATCH = 5;
  for (let i = 0; i < LAYOUT_COUNT; i++) {
    const layout = LAYOUTS[i];
    const padInfo = padPose(i);
    const pad = new THREE.Group();
    pad.name = `apt-layout-${layout.label.replace(/\s+/g, '-')}`;
    pad.position.set(padInfo.x, padInfo.y, padInfo.z);
    pad.rotation.y = padInfo.yaw;
    root.add(pad);

    const wallMat = wallBasic(wallMaps.get(layout.wall) || null, layout.wall);
    const shell = buildShell(wallMat);
    shell.position.y = 0.06;
    pad.add(shell);

    const furn = new THREE.Group();
    furn.name = 'furn';
    furn.position.y = 0.06;
    pad.add(furn);

    const placed = [];
    for (const p of layout.pieces) {
      const pose = extractPiece(pieceMap, p.name);
      if (!pose) {
        placed.push({ name: p.name, status: 'missing' });
        continue;
      }
      placePiece(pose, p);
      furn.add(pose);
      placed.push({ name: p.name, status: 'ok', x: p.x, z: p.z, yaw: p.yaw });
    }

    const label = makeLabelSprite(
      [
        `Candidato / Interior ${String(i + 1).padStart(3, '0')}`,
        `${layout.themeLabel} · ${layout.wall}`,
        `furn ${layout.furnitureVariant} · wallPool ${layout.wallVariant}`
      ],
      { stroke: i % 20 === 0 ? '#fbbf24' : '#34d399' }
    );
    label.scale.set(2.4, 0.55, 1);
    label.position.set(0, 0.02, -0.55);
    pad.add(label);

    const origin = { x: padInfo.x, y: padInfo.y, z: padInfo.z };
    entries.push({
      index: i + 1,
      id: layout.id,
      label: layout.label,
      theme: layout.themeLabel,
      wall: layout.wall,
      furnitureVariant: layout.furnitureVariant,
      wallVariant: layout.wallVariant,
      origin,
      yaw: padInfo.yaw,
      floor: padInfo.floor,
      slot: padInfo.slot,
      pieces: placed,
      pad
    });

    if (i % BATCH === BATCH - 1) await new Promise((r) => setTimeout(r, 0));
  }

  // Floors 4–5: living / sala wall showcase (soft paints, wallpaper, TV accents)
  for (let j = 0; j < LIVING_SHOWCASE_COUNT; j++) {
    const wallId = LIVING_WALL_IDS[j % LIVING_WALL_IDS.length];
    const wallPt = LIVING_WALL_LABELS[wallId] || wallId;
    const padInfo = livingPadPose(j);
    const pad = new THREE.Group();
    pad.name = `apt-living-${wallId}-${j}`;
    pad.position.set(padInfo.x, padInfo.y, padInfo.z);
    pad.rotation.y = padInfo.yaw;
    root.add(pad);

    const wallMat = wallBasic(wallMaps.get(wallId) || null, wallId);
    const shell = buildShell(wallMat);
    shell.position.y = 0.06;
    pad.add(shell);

    const furn = new THREE.Group();
    furn.name = 'furn';
    furn.position.y = 0.06;
    pad.add(furn);

    const placed = [];
    if (sofaName) {
      const pose = extractPiece(pieceMap, sofaName);
      if (pose) {
        placePiece(pose, { name: sofaName, x: 0.05, z: 2.1, yaw: Math.PI });
        furn.add(pose);
        placed.push({ name: sofaName, status: 'ok' });
      }
    }
    if (tvName) {
      const pose = extractPiece(pieceMap, tvName);
      if (pose) {
        // Against back wall — feature / TV wall
        placePiece(pose, { name: tvName, x: 0, z: 0.38, yaw: 0, y: 0.85 });
        furn.add(pose);
        placed.push({ name: tvName, status: 'ok' });
      }
    }

    const label = makeLabelSprite(
      [
        `Sala / Living ${String(j + 1).padStart(2, '0')} · piso ${padInfo.floor}`,
        `${wallPt}`,
        wallId
      ],
      { stroke: '#f472b6', bg: 'rgba(30, 16, 28, 0.92)', fg: '#fce7f3' }
    );
    label.scale.set(2.6, 0.6, 1);
    label.position.set(0, 0.02, -0.55);
    pad.add(label);

    livingEntries.push({
      index: j + 1,
      id: wallId,
      label: wallPt,
      wall: wallId,
      wallLabel: wallPt,
      origin: { x: padInfo.x, y: padInfo.y, z: padInfo.z },
      yaw: padInfo.yaw,
      floor: padInfo.floor,
      slot: padInfo.slot,
      pieces: placed,
      pad
    });

    if (j % BATCH === BATCH - 1) await new Promise((r) => setTimeout(r, 0));
  }

  const midY =
    REVIEW_ORIGIN.y + ((REVIEW_FLOORS - 1) * REVIEW_FLOOR_STEP) * 0.5 + 1.4;
  const livingMidY =
    REVIEW_ORIGIN.y +
    (REVIEW_LAYOUT_FLOORS + (REVIEW_LIVING_FLOORS - 1) * 0.5) * REVIEW_FLOOR_STEP +
    1.4;
  const howToFind =
    `Apt review arena west-south of wall showroom (~238,−42). ` +
    `Center x=${REVIEW_ORIGIN.x}, z=${REVIEW_ORIGIN.z}; ` +
    `${REVIEW_FLOORS} floors × ${REVIEW_PER_RING}/ring, radius ${REVIEW_RADIUS} m, ` +
    `floor step ${REVIEW_FLOOR_STEP} m; open −Z toward center. ` +
    `Floors 0–3: layouts 001…100. Floors 4–5: sala/living wall showcase ` +
    `(${LIVING_SHOWCASE_COUNT} shells, ${LIVING_WALL_IDS.length} textures). ` +
    `API: visit()|'center'|1..100|'living'|'sala'|floor(4|5)|living(1..50).`;

  function applyCameraHint(hint) {
    const rig = typeof window !== 'undefined' ? window.__cityCamRig : null;
    if (!rig?.camera) return;
    rig.camera.position.set(hint.x, hint.y, hint.z);
    rig.camera.lookAt(hint.lookAt.x, hint.lookAt.y, hint.lookAt.z);
    if (typeof rig.applyState === 'function') {
      rig.applyState(
        {
          mode: 'orbit',
          x: hint.x,
          y: hint.y,
          z: hint.z,
          tx: hint.lookAt.x,
          ty: hint.lookAt.y,
          tz: hint.lookAt.z
        },
        null,
        null
      );
    } else if (typeof rig.setMode === 'function') {
      rig.setMode('orbit');
    }
  }

  function hintForEntry(e) {
    const ang = e.yaw;
    const camR = Math.max(2.5, REVIEW_RADIUS - 4.2);
    const lookR = REVIEW_RADIUS + ROOM.depth * 0.45;
    return {
      x: REVIEW_ORIGIN.x + Math.sin(ang) * camR,
      y: e.origin.y + 1.55,
      z: REVIEW_ORIGIN.z + Math.cos(ang) * camR,
      lookAt: {
        x: REVIEW_ORIGIN.x + Math.sin(ang) * lookR,
        y: e.origin.y + 1.2,
        z: REVIEW_ORIGIN.z + Math.cos(ang) * lookR
      }
    };
  }

  function visitCenter() {
    const hint = {
      x: REVIEW_ORIGIN.x,
      y: midY,
      z: REVIEW_ORIGIN.z,
      lookAt: {
        x: REVIEW_ORIGIN.x + REVIEW_RADIUS * 0.35,
        y: midY,
        z: REVIEW_ORIGIN.z + REVIEW_RADIUS * 0.85
      }
    };
    applyCameraHint(hint);
    return {
      entry: null,
      layout: null,
      cameraHint: hint,
      howToFind,
      view: 'center'
    };
  }

  function visitLivingCenter() {
    const hint = {
      x: REVIEW_ORIGIN.x,
      y: livingMidY,
      z: REVIEW_ORIGIN.z,
      lookAt: {
        x: REVIEW_ORIGIN.x + REVIEW_RADIUS * 0.35,
        y: livingMidY,
        z: REVIEW_ORIGIN.z + REVIEW_RADIUS * 0.85
      }
    };
    applyCameraHint(hint);
    return {
      entry: null,
      layout: null,
      cameraHint: hint,
      howToFind,
      view: 'living',
      floor: REVIEW_LAYOUT_FLOORS
    };
  }

  function visitUnit(i) {
    const idx = Math.max(1, Math.min(LAYOUT_COUNT, Number(i) || 1)) - 1;
    const e = entries[idx];
    if (!e) return null;
    const hint = hintForEntry(e);
    applyCameraHint(hint);
    return { entry: e, layout: getLayout(idx), cameraHint: hint, howToFind, view: idx + 1 };
  }

  function visitLiving(i) {
    if (i === undefined || i === null || i === '' || i === true) {
      return visitLivingCenter();
    }
    const idx = Math.max(1, Math.min(LIVING_SHOWCASE_COUNT, Number(i) || 1)) - 1;
    const e = livingEntries[idx];
    if (!e) return null;
    const hint = hintForEntry(e);
    applyCameraHint(hint);
    return { entry: e, layout: null, cameraHint: hint, howToFind, view: `living-${idx + 1}` };
  }

  function visitFloor(n) {
    const floor = Math.max(0, Math.min(REVIEW_FLOORS - 1, Number(n) | 0));
    const y = REVIEW_ORIGIN.y + floor * REVIEW_FLOOR_STEP + 1.4;
    const hint = {
      x: REVIEW_ORIGIN.x,
      y,
      z: REVIEW_ORIGIN.z,
      lookAt: {
        x: REVIEW_ORIGIN.x + REVIEW_RADIUS * 0.4,
        y,
        z: REVIEW_ORIGIN.z + REVIEW_RADIUS * 0.8
      }
    };
    applyCameraHint(hint);
    return { entry: null, layout: null, cameraHint: hint, howToFind, view: `floor-${floor}`, floor };
  }

  /**
   * @param {number|'center'|'living'|'sala'|undefined} i
   * @param {number|undefined} livingIndex — when i is 'living'/'sala'
   */
  function visit(i, livingIndex) {
    if (i === undefined || i === null || i === '' || i === 'center') {
      return visitCenter();
    }
    if (i === 'living' || i === 'sala') {
      return visitLiving(livingIndex);
    }
    if (i === 'floor' || (typeof i === 'string' && /^floor/i.test(i))) {
      const n =
        typeof livingIndex === 'number'
          ? livingIndex
          : Number(String(i).replace(/[^0-9]/g, ''));
      return visitFloor(Number.isFinite(n) ? n : REVIEW_LAYOUT_FLOORS);
    }
    if (typeof i === 'string' && /^L\d+/i.test(i)) {
      return visitLiving(Number(i.slice(1)));
    }
    return visitUnit(i);
  }

  const api = {
    count: LAYOUT_COUNT,
    livingCount: LIVING_SHOWCASE_COUNT,
    livingWallCount: LIVING_WALL_IDS.length,
    livingWallIds: [...LIVING_WALL_IDS],
    root,
    origin: { ...REVIEW_ORIGIN },
    floors: REVIEW_FLOORS,
    layoutFloors: REVIEW_LAYOUT_FLOORS,
    livingFloors: [REVIEW_LAYOUT_FLOORS, REVIEW_LAYOUT_FLOORS + 1],
    perRing: REVIEW_PER_RING,
    radius: REVIEW_RADIUS,
    floorStep: REVIEW_FLOOR_STEP,
    roomSize: { ...ROOM },
    entries,
    livingEntries,
    howToFind,
    visit,
    visitCenter,
    visitLiving,
    visitFloor,
    layout: (i) => getLayout((Number(i) || 1) - 1)
  };
  window.__cityAptLayouts = api;
  console.log('[apt-layouts] review arena ready —', howToFind);
  return api;
}
