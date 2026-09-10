/**
 * optStudyPlaza — in-city A/B (original vs optimized) study plaza for curated GLBs.
 *
 * Place pairs on grass east of apt staging / Large_3 so Ricardo can judge quality.
 * Lazy-loaded after playCore (fire-and-forget). MeshBasic + MeshoptDecoder.
 * FPS acceptance is Windows-only — this module never claims a frame-rate pass.
 *
 * Debug: window.__cityOptStudy
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cachedFetch } from '../engine/assetDiskCache.js';

/** East of Large_3@171,30 / apt grass catalog (~x=188+) — open strip. */
export const OPT_STUDY_ORIGIN = { x: 248, y: 0.02, z: 6 };

/** Original ← left; optimized → right (~5 m). */
const PAIR_OFFSET_X = 5;
/** Row spacing along +Z (south). */
const ROW_DZ = 11;
/** Fit cars to ~this length (m). */
const TARGET_LENGTH = 4.6;

/**
 * Curated study inventory (box `/workspace/uploads/opt-study`).
 * Tris/MB from optimize-report at ship time.
 */
export const OPT_STUDY_ITEMS = [
  {
    id: 'pack_8XGZ',
    label: 'Viatura policial',
    profile: 'vehicle-npc',
    before: { tris: 4250, mb: 0.49 },
    after: { tris: 4250, mb: 0.19 }
  },
  {
    id: 'pack_0BMQ',
    label: 'Monster truck vermelho',
    profile: 'vehicle-hero',
    before: { tris: 15183, mb: 1.73 },
    after: { tris: 15183, mb: 0.61 }
  },
  {
    id: 'pack_WHTC',
    label: 'Pickup / camper',
    profile: 'vehicle-hero',
    before: { tris: 14233, mb: 1.73 },
    after: { tris: 14233, mb: 0.77 }
  },
  {
    id: 'pack_AS5Q',
    label: 'Alfa 4C branca',
    profile: 'vehicle-hero',
    before: { tris: 32651, mb: 8.45 },
    after: { tris: 32651, mb: 1.74 }
  },
  {
    id: 'pack_FG5K',
    label: 'BMW M3 cinza',
    profile: 'vehicle-hero',
    before: { tris: 27946, mb: 9.68 },
    after: { tris: 27930, mb: 2.02 }
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
    (src?.color ? src.color.getHexString() : 'fff');
  if (matCache.has(key)) return matCache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  color.multiplyScalar(1.08);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `optStudy-${src.name}` : 'optStudy-mat',
    side: THREE.DoubleSide,
    transparent: !!src?.transparent,
    opacity: src?.opacity ?? 1,
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

function makeLabelSprite(lines) {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
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
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#e0f2fe';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    const t = lines[i];
    ctx.font =
      i === 0
        ? 'bold 28px system-ui, sans-serif'
        : '22px system-ui, sans-serif';
    ctx.fillText(t, w / 2, (h / (n + 1)) * (i + 1) + (i === 0 ? 2 : 0));
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
  spr.scale.set(Math.min(3.2, 1.2 + longest * 0.055), 0.8, 1);
  spr.position.y = 2.4;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `opt-study-label-${lines[0]}`;
  return spr;
}

/**
 * @param {string} url
 * @returns {Promise<THREE.Object3D|null>}
 */
async function loadStudyGlb(url) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const res = await cachedFetch(url);
  if (!res.ok) {
    console.warn('[opt-study] fetch failed', url, res.status);
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
        console.warn('[opt-study] parse failed', url, err);
        resolve(null);
      }
    );
  });
}

/**
 * Center XZ, floor to y=0, scale to TARGET_LENGTH, face +Z.
 * @param {THREE.Object3D} root
 */
function normalizeVehicle(root) {
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
  const len = Math.max(_size.x, _size.z, 1e-3);
  const s = TARGET_LENGTH / len;
  wrap.scale.setScalar(s);
  if (_size.x > _size.z) {
    wrap.rotation.y = -Math.PI / 2;
  }
  wrap.updateMatrixWorld(true);
  // Re-floor after scale/yaw
  _box.setFromObject(wrap);
  if (Number.isFinite(_box.min.y)) {
    wrap.position.y -= _box.min.y;
  }
  return wrap;
}

/**
 * Spawn plaza under cityGroup. Resolves with debug API (also on window.__cityOptStudy).
 * @param {THREE.Object3D} cityGroup
 * @returns {Promise<{ root: THREE.Group, items: object[], origin: object }>}
 */
export async function spawnOptStudyPlaza(cityGroup) {
  const root = new THREE.Group();
  root.name = 'opt-study-plaza';
  cityGroup.add(root);

  const placed = [];

  // Plaza title
  const title = makeLabelSprite([
    'Plaza A/B — otimização GLB',
    'leste do staging apt (Large_3) · ~x=248'
  ]);
  title.position.set(OPT_STUDY_ORIGIN.x, OPT_STUDY_ORIGIN.y + 3.2, OPT_STUDY_ORIGIN.z - 4);
  title.scale.set(4.5, 1.1, 1);
  root.add(title);

  for (let i = 0; i < OPT_STUDY_ITEMS.length; i++) {
    const item = OPT_STUDY_ITEMS[i];
    const z = OPT_STUDY_ORIGIN.z + i * ROW_DZ;
    const baseX = OPT_STUDY_ORIGIN.x;
    const pair = {
      id: item.id,
      label: item.label,
      profile: item.profile,
      before: item.before,
      after: item.after,
      original: {
        x: baseX,
        y: OPT_STUDY_ORIGIN.y,
        z
      },
      optimized: {
        x: baseX + PAIR_OFFSET_X,
        y: OPT_STUDY_ORIGIN.y,
        z
      },
      status: 'loading'
    };
    placed.push(pair);

    const origUrl = `/models/opt-study/${item.id}/model.original.glb`;
    const optUrl = `/models/opt-study/${item.id}/model.glb`;

    const [origRoot, optRoot] = await Promise.all([
      loadStudyGlb(origUrl),
      loadStudyGlb(optUrl)
    ]);

    if (origRoot) {
      const wrap = normalizeVehicle(origRoot);
      wrap.name = `opt-study-${item.id}-original`;
      wrap.position.set(pair.original.x, pair.original.y, pair.original.z);
      wrap.add(
        makeLabelSprite([
          `${item.label} · original`,
          `${item.id} · ${item.before.tris} tris · ${item.before.mb} MB`
        ])
      );
      root.add(wrap);
      pair.status = 'ok';
    } else {
      pair.status = 'orig-fail';
    }

    if (optRoot) {
      const wrap = normalizeVehicle(optRoot);
      wrap.name = `opt-study-${item.id}-optimized`;
      wrap.position.set(pair.optimized.x, pair.optimized.y, pair.optimized.z);
      wrap.add(
        makeLabelSprite([
          `${item.label} · otimizado`,
          `${item.profile} · ${item.after.tris} tris · ${item.after.mb} MB`
        ])
      );
      root.add(wrap);
      if (pair.status === 'ok' || pair.status === 'loading') pair.status = 'ok';
    } else {
      pair.status = pair.status === 'orig-fail' ? 'fail' : 'opt-fail';
    }
  }

  const api = {
    root,
    items: placed,
    origin: { ...OPT_STUDY_ORIGIN },
    howToFind:
      'Plaza A/B leste do staging apt / Large_3@171,30 — voar/dirigir para ~x=248, z=6…50 (grama).'
  };
  window.__cityOptStudy = api;
  console.log('[opt-study] plaza ready', api.howToFind);
  return api;
}
