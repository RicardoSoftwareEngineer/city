/**
 * Show flat — coherent furnished apartment interior for hero screenshots.
 *
 * Places opt-study interior GLBs as a findable loft next to Large_3 / opt-study:
 *   - loose_cef131  Sala arco (full apt: living + kitchen + dining + bath + bed)
 *   - loose_cece4d  Quarto neon (suite wing)
 *   - loose_fb2319  Mobília / biblioteca (reading annex)
 *
 * MeshBasic + albedo maps (same path as opt-study plaza). No PointLight.
 * Lazy after playCore. Debug: window.__cityShowFlat
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cachedFetch } from '../../engine/assetDiskCache.js';

/**
 * Grass west of opt-study entrance (~x=248), south of Large_3@171,30 /
 * apt staging (~182,22). Arch of the sala opens west toward downtown approach.
 */
export const SHOW_FLAT_ORIGIN = { x: 218, y: 0.02, z: -14 };

/** Pieces of the open-loft composition (optimized GLBs only). */
const PIECES = [
  {
    id: 'loose_cef131',
    role: 'living',
    label: 'Sala arco — living + cozinha + jantar',
    // Natural apartment scale (~14×14 m).
    targetSpan: 14.2,
    // Local offset after normalize (centered, floored).
    offset: { x: 0, y: 0, z: 0 },
    yaw: 0
  },
  {
    id: 'loose_cece4d',
    role: 'bedroom',
    label: 'Quarto neon — suíte',
    targetSpan: 7.2,
    // East wing, slightly north — open-loft suite feel.
    offset: { x: 11.5, y: 0, z: -2.5 },
    yaw: Math.PI / 2
  },
  {
    id: 'loose_fb2319',
    role: 'study',
    label: 'Mobília — biblioteca / estudo',
    targetSpan: 5.5,
    // SE reading annex off the dining side.
    offset: { x: 10.5, y: 0, z: 6.5 },
    yaw: -Math.PI / 2
  }
];

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

const matCache = new Map();

function basicFromSrc(src) {
  const key =
    (src?.map?.uuid || 'nomap') +
    ':' +
    (src?.name || '') +
    ':' +
    (src?.color ? src.color.getHexString() : 'fff') +
    ':' +
    (src?.transparent ? 't' : 'o');
  if (matCache.has(key)) return matCache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  // Slight warmth so evening shots don't go muddy.
  color.multiplyScalar(1.1);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `showFlat-${src.name}` : 'showFlat-mat',
    side: THREE.DoubleSide,
    transparent: !!src?.transparent,
    opacity: src?.opacity ?? 1,
    alphaTest: src?.alphaTest || 0,
    toneMapped: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 2;
  }
  matCache.set(key, mat);
  return mat;
}

function toMeshBasic(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((m) => (m ? basicFromSrc(m) : m));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
  return root;
}

function makeLabelSprite(lines, opts = {}) {
  const w = opts.w || 720;
  const h = opts.h || 140;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.bg || 'rgba(28, 18, 12, 0.9)';
  const r = 14;
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
  ctx.strokeStyle = opts.stroke || '#f59e0b';
  ctx.lineWidth = opts.lineWidth || 5;
  ctx.stroke();
  ctx.fillStyle = opts.fg || '#fef3c7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    const t = lines[i];
    ctx.font =
      i === 0
        ? `bold ${opts.titleSize || 32}px system-ui, sans-serif`
        : `${opts.bodySize || 22}px system-ui, sans-serif`;
    ctx.fillText(t, w / 2, (h / (n + 1)) * (i + 1) + (i === 0 ? 2 : 0), w - 40);
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
  const sx = opts.scaleX || Math.min(5.5, 1.5 + longest * 0.055);
  const sy = opts.scaleY || (opts.h ? opts.h / 150 : 1.0);
  spr.scale.set(sx, sy, 1);
  spr.position.y = opts.y ?? 3.2;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `show-flat-label-${lines[0]}`;
  return spr;
}

async function loadStudyGlb(url) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const res = await cachedFetch(url);
  if (!res.ok) {
    console.warn('[show-flat] fetch failed', url, res.status);
    return null;
  }
  const buf = await res.arrayBuffer();
  return new Promise((resolve) => {
    loader.parse(
      buf,
      dir,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        toMeshBasic(root);
        resolve(root);
      },
      (err) => {
        console.warn('[show-flat] parse failed', url, err);
        resolve(null);
      }
    );
  });
}

/**
 * Center XZ, floor to y=0, uniform scale so max(xz,y*0.55) ≈ targetSpan.
 */
function normalizePiece(root, targetSpan) {
  const wrap = new THREE.Group();
  wrap.add(root);
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  if (_box.isEmpty()) return wrap;
  _box.getCenter(_center);
  _box.getSize(_size);
  root.position.x -= _center.x;
  root.position.y -= _box.min.y;
  root.position.z -= _center.z;
  const len = Math.max(_size.x, _size.z, _size.y * 0.55, 1e-3);
  const s = targetSpan / len;
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  _box.setFromObject(wrap);
  if (Number.isFinite(_box.min.y)) {
    wrap.position.y -= _box.min.y;
  }
  return wrap;
}

function buildPlinth() {
  const g = new THREE.Group();
  g.name = 'show-flat-plinth';
  // Warm stone pad under the loft footprint (MeshBasic — no light loop).
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xc4a574).multiplyScalar(1.05),
    name: 'showFlat-plinth',
    toneMapped: true
  });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(28, 0.08, 22), mat);
  pad.position.set(5, 0.04, 1);
  pad.receiveShadow = false;
  pad.castShadow = false;
  pad.frustumCulled = false;
  g.add(pad);
  // Thin dark edge so the pad reads against grass.
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0x3b2f22,
    name: 'showFlat-plinth-edge',
    toneMapped: true
  });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(28.3, 0.04, 22.3), edgeMat);
  edge.position.set(5, 0.01, 1);
  edge.frustumCulled = false;
  g.add(edge);
  return g;
}

/**
 * Soft evening / late-afternoon (~18:20) for cinematic hero shots.
 * No-op if day/night controller missing.
 */
function applyEveningLight() {
  const hours = 18.35;
  const dn = typeof window !== 'undefined' ? window.__cityDayNight : null;
  if (dn && typeof dn.setHours === 'function') {
    dn.setHours(hours);
    const slider = document.getElementById('day-night-slider');
    const label = document.getElementById('day-night-label');
    if (slider) slider.value = String(hours);
    if (label) {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      label.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return hours;
  }
  return null;
}

/**
 * Spawn the show flat under cityGroup.
 * @param {THREE.Object3D} cityGroup
 */
export async function spawnShowFlatInterior(cityGroup) {
  const root = new THREE.Group();
  root.name = 'show-flat-interior';
  root.position.set(SHOW_FLAT_ORIGIN.x, SHOW_FLAT_ORIGIN.y, SHOW_FLAT_ORIGIN.z);
  cityGroup.add(root);

  root.add(buildPlinth());

  const title = makeLabelSprite(
    ['Apartamento estudo — Show flat', 'Large_3 / opt-study · living + suíte neon + biblioteca'],
    {
      w: 920,
      h: 150,
      scaleX: 8.2,
      scaleY: 1.35,
      titleSize: 34,
      stroke: '#fbbf24',
      bg: 'rgba(40, 22, 10, 0.92)',
      y: 5.2
    }
  );
  title.position.set(4, 0.02, -12);
  root.add(title);

  const placed = [];

  for (const piece of PIECES) {
    const url = `/models/opt-study/${piece.id}/model.glb`;
    const glbRoot = await loadStudyGlb(url);
    await new Promise((r) => setTimeout(r, 0));
    if (!glbRoot) {
      placed.push({ ...piece, status: 'fail' });
      const miss = makeLabelSprite([piece.label, 'AUSENTE'], {
        stroke: '#f87171',
        y: 2.4
      });
      miss.position.set(piece.offset.x, 0, piece.offset.z);
      root.add(miss);
      continue;
    }
    const wrap = normalizePiece(glbRoot, piece.targetSpan);
    wrap.name = `show-flat-${piece.role}-${piece.id}`;
    wrap.rotation.y = piece.yaw;
    wrap.position.set(piece.offset.x, 0.06, piece.offset.z);
    // Piece tags stay hidden by default (clean hero print); toggle via api.setPieceLabels(true).
    const tag = makeLabelSprite([piece.label, piece.id], {
      w: 640,
      h: 110,
      scaleX: 4.2,
      scaleY: 0.85,
      titleSize: 26,
      bodySize: 18,
      y: 3.6,
      stroke: '#38bdf8',
      bg: 'rgba(15, 23, 42, 0.88)'
    });
    tag.name = `show-flat-piece-tag-${piece.role}`;
    tag.visible = false;
    wrap.add(tag);
    root.add(wrap);
    // Re-floor after parent+yaw: feet on plinth top (~6 cm above grass).
    wrap.updateMatrixWorld(true);
    _box.setFromObject(wrap);
    if (Number.isFinite(_box.min.y)) {
      wrap.position.y += root.position.y + 0.06 - _box.min.y;
    }
    placed.push({
      id: piece.id,
      role: piece.role,
      label: piece.label,
      status: 'ok',
      offset: { ...piece.offset },
      yaw: piece.yaw,
      targetSpan: piece.targetSpan
    });
  }

  // Do not force evening on spawn — boot restores localStorage hour preference.
  // visit() / applyEveningLight() still set ~18:35 for screenshots.
  const suggestedHours = 18.35;

  const cameraHint = {
    // Inside / near the west openings — cozy living+dining+kitchen hero.
    x: SHOW_FLAT_ORIGIN.x - 4.2,
    y: 2.15,
    z: SHOW_FLAT_ORIGIN.z + 0.6,
    lookAt: {
      x: SHOW_FLAT_ORIGIN.x + 2.8,
      y: 1.35,
      z: SHOW_FLAT_ORIGIN.z - 0.4
    },
    // Exterior loft overview: neon suite + living + biblioteca.
    alt: {
      x: SHOW_FLAT_ORIGIN.x + 18,
      y: 5.5,
      z: SHOW_FLAT_ORIGIN.z + 16,
      lookAt: {
        x: SHOW_FLAT_ORIGIN.x + 5,
        y: 1.8,
        z: SHOW_FLAT_ORIGIN.z
      }
    },
    // Approach from west (city side) for wayfinding.
    approach: {
      x: SHOW_FLAT_ORIGIN.x - 12,
      y: 4.0,
      z: SHOW_FLAT_ORIGIN.z + 2,
      lookAt: {
        x: SHOW_FLAT_ORIGIN.x + 3,
        y: 1.5,
        z: SHOW_FLAT_ORIGIN.z
      }
    }
  };

  const howToFind =
    `Show flat «Apartamento estudo» na grama oeste do showroom opt-study / ` +
    `sul-leste de Large_3@171,30 — voar para ~x=${SHOW_FLAT_ORIGIN.x}, ` +
    `z=${SHOW_FLAT_ORIGIN.z}. Arco da sala abre para oeste (cidade). ` +
    `Peças: sala arco (cef131) + quarto neon (cece4d) + mobília (fb2319). ` +
    `Câmera hero ~(${cameraHint.x}, ${cameraHint.y}, ${cameraHint.z}) ` +
    `olhando o living. Luz: fim de tarde ~${suggestedHours}h via visit() ` +
    `(window.__cityDayNight.setHours(18.35)).`;

  function applyCameraHint(hint = cameraHint) {
    const cam =
      (typeof window !== 'undefined' && window.__cityCamera) ||
      (typeof window !== 'undefined' && window.__cityFreeCamera) ||
      null;
    // Best-effort: many builds expose free-flight via lookControls / camera API.
    const api = typeof window !== 'undefined' ? window.__cityShowFlat : null;
    if (api) api._lastCameraHint = hint;
    return hint;
  }

  function setPieceLabels(on) {
    root.traverse((o) => {
      if (o.name && o.name.startsWith('show-flat-piece-tag-')) o.visible = !!on;
    });
  }

  const api = {
    root,
    origin: { ...SHOW_FLAT_ORIGIN },
    pieces: placed,
    howToFind,
    cameraHint,
    suggestedHours,
    applyEveningLight,
    applyCameraHint,
    setPieceLabels,
    visit(which = 'hero') {
      applyEveningLight();
      const hint = which === 'alt' ? cameraHint.alt : which === 'approach' ? cameraHint.approach : cameraHint;
      const look = hint.lookAt || cameraHint.lookAt;
      const rig = typeof window !== 'undefined' ? window.__cityCamRig : null;
      if (rig && rig.camera) {
        rig.camera.position.set(hint.x, hint.y, hint.z);
        rig.camera.lookAt(look.x, look.y, look.z);
        if (typeof rig.applyState === 'function') {
          rig.applyState(
            {
              mode: 'orbit',
              x: hint.x,
              y: hint.y,
              z: hint.z,
              tx: look.x,
              ty: look.y,
              tz: look.z
            },
            null,
            null
          );
        } else if (typeof rig.setMode === 'function') {
          rig.setMode('orbit');
        }
      }
      return {
        howToFind,
        cameraHint: hint,
        suggestedHours: 18.35
      };
    }
  };

  window.__cityShowFlat = api;
  console.log('[show-flat] ready —', api.howToFind);
  return api;
}
