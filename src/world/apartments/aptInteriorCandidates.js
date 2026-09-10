/**
 * Official-size apartment interior candidates — five distinct furniture layouts
 * in 3.6×2.75×3.2 m shells (same convention as roomTemplate / aptExampleSandbox).
 *
 * Staging row on free grass east of the show flat / west of opt-study pads.
 * Candidates for the building InstancedMesh bake path — NOT oversized opt-study lofts.
 * Show flat stays untouched. Debug: window.__cityAptCandidates
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import {
  LOFT_FURNITURE_URL,
  NOVOPO_FURNITURE_URL
} from './roomTemplate.js';
import { normalizePieceUpright } from './aptExampleSandbox.js';

/** Official building room (spec 05 / roomTemplate). */
export const ROOM = { width: 3.6, depth: 3.2, height: 2.75, wallT: 0.07 };

/**
 * Row origin: free grass east of show flat (~218,−14) / west-south of opt-study (~248,6).
 * Leave aisle from show-flat plinth (~x≤237); open faces −Z (street looks +Z into room).
 */
export const CANDIDATES_ROW_ORIGIN = { x: 238, y: 0.02, z: -10 };
/** Centre-to-centre spacing along +X (east). */
export const CANDIDATES_SPACING = 5.5;

/**
 * Fit targets (metres) — scaled to fit inside the official shell.
 * Same spirit as aptExampleSandbox FIT / roomTemplate LOFT_PLACEMENTS.
 */
const FIT = {
  sofa: { targetHeight: 0.6, maxWidth: 1.9, maxDepth: 1.35 },
  chair: { targetHeight: 0.75, maxWidth: 0.8, maxDepth: 1.0 },
  coffee: { targetHeight: 0.26, maxWidth: 0.9, maxDepth: 0.9 },
  console: { targetHeight: 0.5, maxWidth: 0.9, maxDepth: 0.5 },
  bar: { targetHeight: 0.85, maxWidth: 1.0, maxDepth: 0.5 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55 },
  tray: { targetHeight: 0.12, maxWidth: 0.4, maxDepth: 0.4 },
  wallart: { targetHeight: 0.7, maxWidth: 0.9, maxDepth: 0.1 },
  rug: { targetHeight: 0.015, maxWidth: 2.2, maxDepth: 2.4 },
  jp_rug_round: { targetHeight: 0.02, maxWidth: 1.8, maxDepth: 1.8 },
  l6_dining: { targetHeight: 0.78, maxWidth: 2.0, maxDepth: 1.4 },
  l6_coffee_a: { targetHeight: 0.4, maxWidth: 1.1, maxDepth: 1.0 },
  l6_sofa: { targetHeight: 0.65, maxWidth: 2.0, maxDepth: 1.5 },
  l2_chair: { targetHeight: 0.85, maxWidth: 0.9, maxDepth: 0.95 },
  l2_coffee: { targetHeight: 0.4, maxWidth: 1.0, maxDepth: 0.9 },
  l2_plant: { targetHeight: 1.1, maxWidth: 0.7, maxDepth: 0.7 },
  l2_side_table: { targetHeight: 0.55, maxWidth: 0.7, maxDepth: 0.7 },
  mini_sofa: { targetHeight: 0.55, maxWidth: 1.6, maxDepth: 1.1 },
  mini_lounge: { targetHeight: 0.7, maxWidth: 1.2, maxDepth: 1.1 },
  mini_coffee: { targetHeight: 0.28, maxWidth: 0.85, maxDepth: 0.85 },
  mini_console: { targetHeight: 0.55, maxWidth: 1.0, maxDepth: 0.45 },
  mini_table: { targetHeight: 0.75, maxWidth: 1.2, maxDepth: 1.0 },
  chair2_1: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_2: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_3: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_4: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  jp_table_geo: { targetHeight: 0.75, maxWidth: 1.5, maxDepth: 1.1 },
  jp_wood_bench: { targetHeight: 0.4, maxWidth: 0.55, maxDepth: 1.3 },
  shelf_1: { targetHeight: 1.4, maxWidth: 0.9, maxDepth: 0.4 },
  clock_stand: { targetHeight: 1.2, maxWidth: 0.45, maxDepth: 0.45 }
};

/**
 * Five distinct themes — yaw-only, floored, upright; open face −Z.
 * Room local: X∈[-1.8,1.8], Z∈[0,3.2], Y∈[0,2.75].
 */
const THEMES = [
  {
    id: 'living-classico',
    label: 'Living clássico',
    short: 'sofa + coffee + plant + console',
    pieces: [
      { name: 'rug', x: 0.0, y: 0, z: 1.5, yaw: 0 },
      { name: 'sofa', x: 0.05, y: 0, z: 2.05, yaw: Math.PI },
      { name: 'coffee', x: 0.0, y: 0, z: 1.05, yaw: 0 },
      { name: 'console', x: 1.45, y: 0, z: 1.85, yaw: -Math.PI / 2 },
      { name: 'plant', x: 1.35, y: 0, z: 0.4, yaw: 0.25 },
      { name: 'wallart', x: -1.55, y: 1.2, z: 1.55, yaw: Math.PI / 2 }
    ]
  },
  {
    id: 'compact-tv',
    label: 'Compact TV / lounge',
    short: 'sofa frente TV + lounge',
    pieces: [
      { name: 'rug', x: 0.05, y: 0, z: 1.45, yaw: 0.1 },
      // Sofa along back wall, facing open glass (−Z / toward console as TV stand).
      { name: 'mini_sofa', x: 0.0, y: 0, z: 2.35, yaw: Math.PI },
      { name: 'mini_console', x: 0.0, y: 0, z: 0.45, yaw: 0 },
      { name: 'mini_lounge', x: -1.25, y: 0, z: 1.55, yaw: Math.PI * 0.55 },
      { name: 'mini_coffee', x: 0.15, y: 0, z: 1.35, yaw: 0.2 },
      { name: 'plant', x: 1.4, y: 0, z: 2.4, yaw: -0.3 }
    ]
  },
  {
    id: 'dining',
    label: 'Dining / mesa',
    short: 'mesa + cadeiras',
    pieces: [
      { name: 'rug', x: 0.0, y: 0, z: 1.55, yaw: 0 },
      { name: 'l6_dining', x: 0.0, y: 0, z: 1.55, yaw: 0 },
      { name: 'chair2_1', x: -0.85, y: 0, z: 1.15, yaw: Math.PI * 0.5 },
      { name: 'chair2_2', x: 0.85, y: 0, z: 1.15, yaw: -Math.PI * 0.5 },
      { name: 'chair2_3', x: -0.85, y: 0, z: 1.95, yaw: Math.PI * 0.5 },
      { name: 'chair2_4', x: 0.85, y: 0, z: 1.95, yaw: -Math.PI * 0.5 },
      { name: 'plant', x: 1.45, y: 0, z: 0.45, yaw: 0.4 },
      { name: 'console', x: -1.45, y: 0, z: 2.5, yaw: Math.PI / 2 }
    ]
  },
  {
    id: 'study',
    label: 'Study / desk',
    short: 'mesa + cadeira + planta',
    pieces: [
      { name: 'rug', x: 0.1, y: 0, z: 1.6, yaw: 0.05 },
      // Desk against back wall (console as desk surface).
      { name: 'console', x: 0.15, y: 0, z: 2.55, yaw: 0 },
      { name: 'chair', x: 0.15, y: 0, z: 1.85, yaw: 0 },
      { name: 'shelf_1', x: -1.5, y: 0, z: 2.0, yaw: Math.PI / 2 },
      { name: 'plant', x: 1.4, y: 0, z: 0.5, yaw: 0.2 },
      { name: 'l2_side_table', x: 1.35, y: 0, z: 2.35, yaw: 0.3 },
      { name: 'wallart', x: 1.55, y: 1.35, z: 1.4, yaw: -Math.PI / 2 }
    ]
  },
  {
    id: 'minimal',
    label: 'Minimal / sparse',
    short: 'poucas peças modernas',
    pieces: [
      { name: 'jp_rug_round', x: 0.0, y: 0, z: 1.5, yaw: 0 },
      { name: 'chair', x: -0.35, y: 0, z: 1.7, yaw: Math.PI * 0.85 },
      { name: 'l2_plant', x: 1.3, y: 0, z: 0.55, yaw: 0.15 },
      { name: 'l2_coffee', x: 0.2, y: 0, z: 1.05, yaw: 0.4 }
    ]
  }
];

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

const matCache = new Map();

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
    name: src?.name ? `aptCand-${src.name}` : 'aptCand-mat',
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

function fitFor(name) {
  if (FIT[name]) return FIT[name];
  if (name.startsWith('chair')) return FIT.chair;
  if (name.startsWith('plant') || name.startsWith('l2_plant') || name.startsWith('l13_plant')) {
    return FIT.plant;
  }
  if (name.includes('rug') || name.includes('mat')) return FIT.rug;
  return { targetHeight: 0.7, maxWidth: 1.2, maxDepth: 1.2 };
}

/** Empty shell: floor + ceiling + 3 walls; open face at z≈0 (faces −Z). */
function buildShell() {
  const { width, depth, height, wallT } = ROOM;
  const g = new THREE.Group();
  g.name = 'apt-candidate-shell';

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

  return g;
}

function makeLabelSprite(lines, opts = {}) {
  const w = opts.w || 640;
  const h = opts.h || 120;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.9)';
  const r = 12;
  ctx.beginPath();
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
  ctx.strokeStyle = opts.stroke || '#34d399';
  ctx.lineWidth = opts.lineWidth || 4;
  ctx.stroke();
  ctx.fillStyle = opts.fg || '#ecfdf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    ctx.font =
      i === 0
        ? `bold ${opts.titleSize || 28}px system-ui, sans-serif`
        : `${opts.bodySize || 18}px system-ui, sans-serif`;
    ctx.fillText(lines[i], w / 2, (h / (n + 1)) * (i + 1) + (i === 0 ? 2 : 0), w - 36);
  }
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
  const longest = Math.max(...lines.map((s) => s.length));
  spr.scale.set(opts.scaleX || Math.min(4.8, 1.4 + longest * 0.05), opts.scaleY || 0.95, 1);
  spr.position.y = opts.y ?? 3.4;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `apt-cand-label-${lines[0]}`;
  return spr;
}

/**
 * @param {Map<string, THREE.Object3D>} pieceMap
 * @param {string} name
 */
function extractPiece(pieceMap, name) {
  const src = pieceMap.get(name);
  if (!src) {
    console.warn('[apt-candidates] piece missing', name);
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

  const fit = fitFor(name);
  const fitScale = fitUniformScale(pose, fit);
  pose.scale.setScalar(fitScale);
  pose.updateMatrixWorld(true);
  _box.setFromObject(pose);
  if (!_box.isEmpty()) {
    inner.position.y -= _box.min.y / fitScale;
  }
  pose.userData.aptCandFitScale = fitScale;
  return pose;
}

function indexPieces(root, map) {
  if (!root) return;
  root.traverse((o) => {
    if (o.name && !map.has(o.name)) map.set(o.name, o);
  });
}

function placePiece(pose, layout) {
  const fit = pose.userData.aptCandFitScale || 1;
  pose.position.set(layout.x, layout.y ?? 0, layout.z);
  pose.rotation.set(0, layout.yaw ?? 0, 0);
  pose.scale.setScalar(fit);
  // Floor contact when y is default 0; wallart keeps authored y.
  if ((layout.y ?? 0) === 0) {
    pose.updateMatrixWorld(true);
    _box.setFromObject(pose);
    if (!_box.isEmpty()) {
      pose.position.y -= _box.min.y;
    }
  }
}

function padWorldOrigin(index) {
  return {
    x: CANDIDATES_ROW_ORIGIN.x + index * CANDIDATES_SPACING,
    y: CANDIDATES_ROW_ORIGIN.y,
    z: CANDIDATES_ROW_ORIGIN.z
  };
}

/**
 * Spawn 5 candidate shells + themed interiors under cityGroup.
 * @param {THREE.Object3D} cityGroup
 */
export async function spawnAptInteriorCandidates(cityGroup) {
  const root = new THREE.Group();
  root.name = 'apt-interior-candidates';
  cityGroup.add(root);

  const pieceMap = new Map();
  const loftRoot = await loadGltf(LOFT_FURNITURE_URL);
  await new Promise((r) => setTimeout(r, 0));
  const novopoRoot = await loadGltf(NOVOPO_FURNITURE_URL);
  await new Promise((r) => setTimeout(r, 0));
  indexPieces(loftRoot, pieceMap);
  indexPieces(novopoRoot, pieceMap);

  const candidates = [];

  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i];
    const origin = padWorldOrigin(i);
    const pad = new THREE.Group();
    pad.name = `apt-candidate-${i + 1}-${theme.id}`;
    pad.position.set(origin.x, origin.y, origin.z);
    root.add(pad);

    // Thin stone pad under footprint so size reads against grass.
    const plinthMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xb8a078).multiplyScalar(1.02),
      name: 'aptCand-plinth',
      toneMapped: true
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(ROOM.width + 0.4, 0.06, ROOM.depth + 0.4), plinthMat);
    plinth.position.set(0, 0.03, ROOM.depth * 0.5);
    plinth.frustumCulled = false;
    pad.add(plinth);

    const shell = buildShell();
    shell.position.y = 0.06;
    pad.add(shell);

    const furn = new THREE.Group();
    furn.name = `apt-candidate-furn-${theme.id}`;
    furn.position.y = 0.06;
    pad.add(furn);

    const placed = [];
    for (const layout of theme.pieces) {
      const pose = extractPiece(pieceMap, layout.name);
      if (!pose) {
        placed.push({ name: layout.name, status: 'missing' });
        continue;
      }
      placePiece(pose, layout);
      furn.add(pose);
      placed.push({
        name: layout.name,
        status: 'ok',
        x: layout.x,
        y: layout.y ?? 0,
        z: layout.z,
        yaw: layout.yaw ?? 0
      });
    }

    const label = makeLabelSprite(
      [`Candidato ${i + 1} — ${theme.label}`, `${ROOM.width}×${ROOM.height}×${ROOM.depth} m · ${theme.short}`],
      {
        w: 720,
        h: 110,
        scaleX: 4.6,
        scaleY: 0.9,
        titleSize: 26,
        bodySize: 17,
        y: 3.55,
        stroke: i === 0 ? '#fbbf24' : '#34d399'
      }
    );
    // Label in front of open face (−Z) so it reads from approach.
    label.position.set(0, 0.02, -0.8);
    pad.add(label);

    candidates.push({
      index: i + 1,
      id: theme.id,
      label: theme.label,
      short: theme.short,
      origin: { ...origin },
      size: { width: ROOM.width, height: ROOM.height, depth: ROOM.depth },
      openFace: '-Z',
      pieces: placed,
      pad
    });
  }

  const howToFind =
    `5 candidatos oficiais (3.6×2.75×3.2 m) na grama livre a leste do show flat ` +
    `(«Apartamento estudo» ~218,−14) / oeste-sul dos pads opt-study (~248,6). ` +
    `Fila em x=${CANDIDATES_ROW_ORIGIN.x}…${CANDIDATES_ROW_ORIGIN.x + 4 * CANDIDATES_SPACING}, ` +
    `z=${CANDIDATES_ROW_ORIGIN.z} (espaçamento ${CANDIDATES_SPACING} m). ` +
    `Abertura −Z. Labels «Candidato 1…5». ` +
    `API: window.__cityAptCandidates.visit(1..5).`;

  function visit(i = 1) {
    const idx = Math.max(1, Math.min(5, Number(i) || 1)) - 1;
    const c = candidates[idx];
    if (!c) return null;
    const hint = {
      x: c.origin.x,
      y: 1.55,
      z: c.origin.z - 3.2,
      lookAt: {
        x: c.origin.x,
        y: 1.2,
        z: c.origin.z + ROOM.depth * 0.45
      }
    };
    const rig = typeof window !== 'undefined' ? window.__cityCamRig : null;
    if (rig && rig.camera) {
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
    return { candidate: c, cameraHint: hint, howToFind };
  }

  const api = {
    root,
    rowOrigin: { ...CANDIDATES_ROW_ORIGIN },
    spacing: CANDIDATES_SPACING,
    roomSize: { ...ROOM },
    openFace: '-Z',
    convention: 'X∈[-1.8,1.8], Z∈[0,3.2], glass/opening faces −Z (same as roomTemplate)',
    candidates,
    howToFind,
    visit,
    themes: THEMES.map((t, i) => ({
      index: i + 1,
      id: t.id,
      label: t.label,
      short: t.short
    }))
  };

  window.__cityAptCandidates = api;
  console.log('[apt-candidates] ready —', howToFind);
  return api;
}
