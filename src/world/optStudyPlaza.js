/**
 * optStudyPlaza — in-city A/B showroom for ALL unique study GLBs (33 pads).
 *
 * Each pad: original (left) | otimizado (right) ~5 m apart, PT labels.
 * Organized by category sections on grass east of Large_3 (~x=248).
 * Lazy-loaded after playCore. MeshBasic keeps maps (screenshot-proof textures).
 * FPS acceptance is Windows-only — this module never claims a frame-rate pass.
 *
 * Debug: window.__cityOptStudy  (pads[], howToFind, howToVisit(id), inventory)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cachedFetch } from '../engine/assetDiskCache.js';

/** East of Large_3@171,30 / apt grass catalog — open strip. */
export const OPT_STUDY_ORIGIN = { x: 248, y: 0.02, z: 6 };

/** Original ← left; optimized → right (~5 m). */
const PAIR_OFFSET_X = 5;
/** Pad spacing along +Z within a section. */
const ROW_DZ = 12;
/** Gap between category sections along +Z. */
const SECTION_GAP_Z = 18;
/** Extra columns for wide sections (cars). */
const COL_DX = 22;
const COLS_PER_SECTION = {
  carros: 2,
  caminhoes: 2,
  casas: 2,
  apartamentos: 1,
  props: 2
};

/** Fit vehicles to ~this length (m); buildings use TARGET_BUILDING. */
const TARGET_LENGTH = 4.6;
const TARGET_BUILDING = 8.5;
const TARGET_PROP = 3.2;

/**
 * Full study inventory — one pad per unique GLB (skip *(1) duplicate only).
 * Stats filled at ship time from optimize-report when available.
 */
export const OPT_STUDY_SECTIONS = [
  {
    id: 'carros',
    title: 'Carros',
    items: [
      { id: 'pack_8XGZ', label: 'Viatura policial', profile: 'vehicle-npc', kind: 'vehicle', before: { tris: 4250, mb: 0.49 }, after: { tris: 4250, mb: 0.19 } },
      { id: 'pack_0BMQ', label: 'Monster truck vermelho', profile: 'vehicle-hero', kind: 'vehicle', before: { tris: 15183, mb: 1.73 }, after: { tris: 15183, mb: 0.61 } },
      { id: 'pack_WHTC', label: 'Pickup / camper', profile: 'vehicle-hero', kind: 'vehicle', before: { tris: 14233, mb: 1.73 }, after: { tris: 14233, mb: 0.77 } },
      { id: 'pack_AS5Q', label: 'Alfa 4C branca', profile: 'vehicle-hero', kind: 'vehicle', before: { tris: 32651, mb: 8.45 }, after: { tris: 32651, mb: 1.74 } },
      { id: 'pack_FG5K', label: 'BMW M3 corrida', profile: 'vehicle-hero', kind: 'vehicle', before: { tris: 27946, mb: 9.68 }, after: { tris: 27930, mb: 2.02 } },
      { id: 'pack_5RZ8', label: 'Van EY-TEAM', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 12226, mb: 1.61 }, after: { tris: 12226, mb: 0.8 } },
      { id: 'pack_6PJ4', label: 'Track car tubular', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 30536, mb: 11.88 }, after: { tris: 30536, mb: 1.78 } },
      { id: 'pack_7XIR', label: 'Lamborghini Centenario', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 279564, mb: 39.1 }, after: { tris: 276234, mb: 14.02 } },
      { id: 'pack_9HPS', label: 'Citroën DS3 rally', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 70926, mb: 8.22 }, after: { tris: 61406, mb: 2.62 } },
      { id: 'pack_IYDL', label: 'Mustang Boss 302', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 30708, mb: 8.31 }, after: { tris: 30708, mb: 1.69 } },
      { id: 'pack_JS4S', label: 'BMW 1M cupê', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 30855, mb: 8.06 }, after: { tris: 30855, mb: 1.59 } },
      { id: 'pack_O5F3', label: 'Nissan GT-R R34', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 29535, mb: 7.22 }, after: { tris: 29535, mb: 1.69 } },
      { id: 'pack_X6GN', label: 'Skoda conversível', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 13224, mb: 4.15 }, after: { tris: 13224, mb: 1.48 } },
      { id: 'loose_2ee70c', label: 'SRT sedan (loose)', profile: 'vehicle-npc', kind: 'vehicle' , before: { tris: 21839, mb: 2.94 }, after: { tris: 24640, mb: 0.93 } }
    ]
  },
  {
    id: 'caminhoes',
    title: 'Caminhões / utilitários',
    items: [
      { id: 'pack_9AP7', label: 'Caminhão corrida 83', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 46538, mb: 4.35 }, after: { tris: 46538, mb: 1.55 } },
      { id: 'pack_HQZJ', label: 'Caminhão MAZ cabine', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 64198, mb: 88.3 }, after: { tris: 64198, mb: 17.2 } },
      { id: 'pack_YMRF', label: 'Ônibus urbano', profile: 'vehicle-npc', kind: 'vehicle' , before: { tris: 18437, mb: 1.87 }, after: { tris: 17272, mb: 0.69 } },
      { id: 'pack_BXWW', label: 'Van Dodge abandonada', profile: 'vehicle-npc', kind: 'vehicle' , before: { tris: 3284, mb: 1.42 }, after: { tris: 3284, mb: 0.29 } },
      { id: 'pack_GCVG', label: 'APC militar', profile: 'vehicle-npc', kind: 'vehicle' , before: { tris: 30320, mb: 6.7 }, after: { tris: 30204, mb: 1.78 } },
      { id: 'pack_KIP5', label: 'Jeep off-road militar', profile: 'vehicle-hero', kind: 'vehicle' , before: { tris: 25608, mb: 11.09 }, after: { tris: 25608, mb: 6.11 } },
      { id: 'pack_MD8J', label: 'Locomotiva industrial M-1', profile: 'building', kind: 'vehicle' , before: { tris: 140001, mb: 37.74 }, after: { tris: 138205, mb: 17.42 } }
    ]
  },
  {
    id: 'casas',
    title: 'Casas',
    items: [
      { id: 'loose_3d6a9c', label: 'Casa moderna 02', profile: 'building', kind: 'building' , before: { tris: 15345, mb: 1.99 }, after: { tris: 15345, mb: 1.17 } },
      { id: 'loose_554632', label: 'Casa madeira / telhado', profile: 'building', kind: 'building' , before: { tris: 3300, mb: 5.2 }, after: { tris: 3072, mb: 1.76 } },
      { id: 'loose_2610bb', label: 'Módulo telhado / casa', profile: 'building', kind: 'building' , before: { tris: 47812, mb: 7.44 }, after: { tris: 62032, mb: 2.53 } },
      { id: 'loose_8b4293', label: 'Casa paredes (loose)', profile: 'building', kind: 'building' , before: { tris: 62615, mb: 10.13 }, after: { tris: 74819, mb: 3.4 } }
    ]
  },
  {
    id: 'apartamentos',
    title: 'Apartamentos / prédios',
    items: [
      { id: 'loose_1e0296', label: 'Apartamento corpo', profile: 'building', kind: 'building' , before: { tris: 174133, mb: 14.24 }, after: { tris: 121522, mb: 3.29 } },
      { id: 'loose_51892e', label: 'Prédio lajes / salas', profile: 'building', kind: 'building' , before: { tris: 82935, mb: 9.2 }, after: { tris: 145480, mb: 1.91 } },
      { id: 'loose_0c3e36', label: 'Prédio / estrutura grande', profile: 'building', kind: 'building' , before: { tris: 1023652, mb: 76.24 }, after: { tris: 132094, mb: 2.25 } }
    ]
  },
  {
    id: 'props',
    title: 'Props / interiores / outros',
    items: [
      { id: 'loose_cece4d', label: 'Quarto neon', profile: 'interior-prop', kind: 'prop' , before: { tris: 18551, mb: 3.2 }, after: { tris: 28801, mb: 0.88 } },
      { id: 'loose_cef131', label: 'Sala arco + sofá', profile: 'interior-prop', kind: 'prop' , before: { tris: 171207, mb: 23.06 }, after: { tris: 180349, mb: 5.34 } },
      { id: 'loose_fb2319', label: 'Mobília (loose)', profile: 'interior-prop', kind: 'prop' , before: { tris: 53559, mb: 5.9 }, after: { tris: 67133, mb: 1.75 } },
      { id: 'loose_4dc135', label: 'Interior banheiro/bancada', profile: 'interior-prop', kind: 'prop' , before: { tris: 425289, mb: 41.69 }, after: { tris: 165025, mb: 4.84 } },
      { id: 'loose_d438cf', label: 'Aeronave (loose)', profile: 'prop-street', kind: 'prop' , before: { tris: 143573, mb: 11.84 }, after: { tris: 184199, mb: 3.89 } }
    ]
  }
];

/** Flat list (33) for debug / screenshots. */
export const OPT_STUDY_ITEMS = OPT_STUDY_SECTIONS.flatMap((s) =>
  s.items.map((it) => ({ ...it, section: s.id, sectionTitle: s.title }))
);

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
  color.multiplyScalar(1.08);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `optStudy-${src.name}` : 'optStudy-mat',
    side: THREE.DoubleSide,
    transparent: !!src?.transparent,
    opacity: src?.opacity ?? 1,
    alphaTest: src?.alphaTest || 0,
    toneMapped: true
  });
  // Keep albedo maps so screenshot pads show real textures (not pink/black).
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
  const w = opts.w || 640;
  const h = opts.h || 140;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.88)';
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
  ctx.strokeStyle = opts.stroke || '#38bdf8';
  ctx.lineWidth = opts.lineWidth || 5;
  ctx.stroke();
  ctx.fillStyle = opts.fg || '#e0f2fe';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    const t = lines[i];
    ctx.font =
      i === 0
        ? `bold ${opts.titleSize || 30}px system-ui, sans-serif`
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
  const sx = opts.scaleX || Math.min(4.2, 1.3 + longest * 0.055);
  const sy = opts.scaleY || (opts.h ? opts.h / 160 : 0.9);
  spr.scale.set(sx, sy, 1);
  spr.position.y = opts.y ?? 2.6;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `opt-study-label-${lines[0]}`;
  return spr;
}

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

function targetLengthFor(kind) {
  if (kind === 'building') return TARGET_BUILDING;
  if (kind === 'prop') return TARGET_PROP;
  return TARGET_LENGTH;
}

function normalizeModel(root, kind) {
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
  const s = targetLengthFor(kind) / len;
  wrap.scale.setScalar(s);
  if (kind === 'vehicle' && _size.x > _size.z) {
    wrap.rotation.y = -Math.PI / 2;
  }
  wrap.updateMatrixWorld(true);
  _box.setFromObject(wrap);
  if (Number.isFinite(_box.min.y)) {
    wrap.position.y -= _box.min.y;
  }
  return wrap;
}

function layoutPads() {
  const pads = [];
  let cursorZ = OPT_STUDY_ORIGIN.z;
  let padIndex = 0;

  for (const section of OPT_STUDY_SECTIONS) {
    const cols = COLS_PER_SECTION[section.id] || 1;
    const n = section.items.length;
    const rows = Math.ceil(n / cols);

    pads.push({
      type: 'section-header',
      sectionId: section.id,
      title: section.title,
      x: OPT_STUDY_ORIGIN.x + PAIR_OFFSET_X / 2,
      y: OPT_STUDY_ORIGIN.y,
      z: cursorZ - 6
    });

    for (let i = 0; i < n; i++) {
      const item = section.items[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = OPT_STUDY_ORIGIN.x + col * COL_DX;
      const z = cursorZ + row * ROW_DZ;
      pads.push({
        type: 'pad',
        padIndex: padIndex++,
        sectionId: section.id,
        sectionTitle: section.title,
        id: item.id,
        label: item.label,
        profile: item.profile,
        kind: item.kind || 'vehicle',
        before: item.before || null,
        after: item.after || null,
        original: { x, y: OPT_STUDY_ORIGIN.y, z },
        optimized: { x: x + PAIR_OFFSET_X, y: OPT_STUDY_ORIGIN.y, z },
        cameraHint: {
          x: x + PAIR_OFFSET_X / 2,
          y: 6,
          z: z + 10
        },
        status: 'pending'
      });
    }
    cursorZ += rows * ROW_DZ + SECTION_GAP_Z;
  }
  return pads;
}

async function placePad(root, pad) {
  const origUrl = `/models/opt-study/${pad.id}/model.original.glb`;
  const optUrl = `/models/opt-study/${pad.id}/model.glb`;

  const [origRoot, optRoot] = await Promise.all([
    loadStudyGlb(origUrl),
    loadStudyGlb(optUrl)
  ]);

  const nameSpr = makeLabelSprite(
    [
      `${pad.padIndex + 1}. ${pad.label}`,
      `${pad.id} · ${pad.profile}`
    ],
    { y: 3.4, scaleX: 4.0, scaleY: 1.0, stroke: '#fbbf24' }
  );
  nameSpr.position.set(
    (pad.original.x + pad.optimized.x) / 2,
    pad.original.y + 0.02,
    pad.original.z - 3.2
  );
  root.add(nameSpr);

  let status = 'ok';
  if (origRoot) {
    const wrap = normalizeModel(origRoot, pad.kind);
    wrap.name = `opt-study-${pad.id}-original`;
    wrap.position.set(pad.original.x, pad.original.y, pad.original.z);
    const b = pad.before;
    wrap.add(
      makeLabelSprite([
        'original',
        b ? `${b.tris} tris · ${b.mb} MB` : pad.id
      ])
    );
    root.add(wrap);
  } else {
    status = 'orig-fail';
    const miss = makeLabelSprite([`${pad.label}`, 'original AUSENTE'], {
      stroke: '#f87171',
      y: 2.2
    });
    miss.position.set(pad.original.x, pad.original.y, pad.original.z);
    root.add(miss);
  }

  if (optRoot) {
    const wrap = normalizeModel(optRoot, pad.kind);
    wrap.name = `opt-study-${pad.id}-optimized`;
    wrap.position.set(pad.optimized.x, pad.optimized.y, pad.optimized.z);
    const a = pad.after;
    wrap.add(
      makeLabelSprite([
        'otimizado',
        a ? `${pad.profile} · ${a.tris} tris · ${a.mb} MB` : pad.profile
      ])
    );
    root.add(wrap);
  } else {
    status = status === 'orig-fail' ? 'fail' : 'opt-fail';
    const miss = makeLabelSprite([`${pad.label}`, 'otimizado AUSENTE'], {
      stroke: '#f87171',
      y: 2.2
    });
    miss.position.set(pad.optimized.x, pad.optimized.y, pad.optimized.z);
    root.add(miss);
  }

  pad.status = status;
  return pad;
}

/**
 * Spawn categorized A/B showroom under cityGroup.
 * @param {THREE.Object3D} cityGroup
 */
export async function spawnOptStudyPlaza(cityGroup) {
  const root = new THREE.Group();
  root.name = 'opt-study-plaza';
  cityGroup.add(root);

  const layout = layoutPads();
  const pads = layout.filter((p) => p.type === 'pad');
  const headers = layout.filter((p) => p.type === 'section-header');

  const title = makeLabelSprite(
    [
      'Showroom A/B — otimização GLB (33 pads)',
      'leste do staging apt (Large_3) · original | otimizado'
    ],
    { w: 900, h: 150, scaleX: 7.5, scaleY: 1.25, titleSize: 32, y: 4.2 }
  );
  title.position.set(
    OPT_STUDY_ORIGIN.x + PAIR_OFFSET_X / 2,
    OPT_STUDY_ORIGIN.y + 3.5,
    OPT_STUDY_ORIGIN.z - 10
  );
  root.add(title);

  for (const h of headers) {
    const spr = makeLabelSprite([h.title, 'seção'], {
      w: 720,
      h: 120,
      scaleX: 6.5,
      scaleY: 1.35,
      titleSize: 36,
      stroke: '#a78bfa',
      bg: 'rgba(46, 16, 80, 0.9)',
      y: 4.5
    });
    spr.position.set(h.x, h.y + 0.02, h.z);
    root.add(spr);
  }

  // Lazy: one pad at a time so boot stays sane (yield between pads).
  for (const pad of pads) {
    pad.status = 'loading';
    await placePad(root, pad);
    await new Promise((r) => setTimeout(r, 0));
  }

  const inventory = OPT_STUDY_ITEMS.map((it) => {
    const pad = pads.find((p) => p.id === it.id);
    return {
      id: it.id,
      label: it.label,
      section: it.sectionTitle,
      profile: it.profile,
      status: pad?.status,
      original: pad?.original,
      optimized: pad?.optimized,
      cameraHint: pad?.cameraHint
    };
  });

  const howToFind =
    `Showroom A/B (33 pads) leste do staging apt / Large_3@171,30 — ` +
    `voar/dirigir para ~x=${OPT_STUDY_ORIGIN.x}, z=${OPT_STUDY_ORIGIN.z}… ` +
    `(seções: Carros → Caminhões → Casas → Apts → Props). ` +
    `Cada pad: original à esquerda, otimizado à direita (~${PAIR_OFFSET_X} m).`;

  function howToVisit(id) {
    const pad = pads.find((p) => p.id === id);
    if (!pad) return `Pad ${id} não encontrado (esperado 33).`;
    const c = pad.cameraHint;
    return (
      `Pad #${pad.padIndex + 1} ${pad.label} [${pad.sectionTitle}] — ` +
      `câmera ~(${c.x.toFixed(1)}, ${c.y}, ${c.z.toFixed(1)}); ` +
      `original (${pad.original.x}, ${pad.original.z}) | ` +
      `otimizado (${pad.optimized.x}, ${pad.optimized.z}). Status=${pad.status}`
    );
  }

  const api = {
    root,
    origin: { ...OPT_STUDY_ORIGIN },
    padCount: pads.length,
    pads,
    inventory,
    sections: OPT_STUDY_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      count: s.items.length
    })),
    howToFind,
    howToVisit,
    visitAll: () => pads.map((p) => howToVisit(p.id))
  };
  window.__cityOptStudy = api;
  console.log('[opt-study] showroom ready', api.padCount, 'pads —', api.howToFind);
  return api;
}
