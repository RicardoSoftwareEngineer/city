/**
 * Extract remaining novopo packs (+ keep JP) → lean floored Y-up GLB.
 *
 * Furniture/decor only — skip architecture, cars, Point/Sun/Spot lights.
 * FBX node packs: local mesh verts + Rx(-90) (same as loft_5 / jp11).
 * Hierarchical packs (shelves/chairs/clock): bake transforms under piece root.
 *
 * Usage:
 *   NODE_PATH=/tmp/loft-tools/node_modules node scripts/extract-novopo-packs.mjs
 */
import fs from 'fs';
import { createRequire } from 'module';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import * as THREE from 'three';

const require = createRequire(import.meta.url);
let sharp;
for (const p of [
  '/tmp/loft-tools/node_modules/sharp',
  '/home/box/.npm/_npx/a6797f7ff67bb1f2/node_modules/sharp',
  'sharp'
]) {
  try {
    sharp = require(p);
    break;
  } catch {}
}
if (!sharp) throw new Error('sharp not found — npm i sharp in /tmp/loft-tools');

const SRC_DIR = process.env.NOVOPO_SRC_DIR || '/workspace/uploads/novopo-interiors';
const OUT =
  process.env.NOVOPO_OUT ||
  '/workspace/city/public/models/apartments/novopo_furniture.glb';
const TEX_DEFAULT = 512;
const TEX_HERO = 1024;

/**
 * Pack definitions.
 * pieces: parentName → { name, mode:'localZUp'|'bake', texMax?, texFormat?, brighten? }
 * For clock, synthetic multi-root via `combineRoots`.
 */
const PACKS = [
  {
    id: 'jp11',
    file: 'loft_japanese_11_free_interior.glb',
    pieces: {
      node_0: { name: 'jp_cushion', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.005': { name: 'jp_tea_set', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.006': { name: 'jp_geisha', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.007': { name: 'jp_moongate', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.008': { name: 'jp_stone_lantern', mode: 'bake', texMax: TEX_DEFAULT },
      Cube: { name: 'jp_mat_a', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.001': { name: 'jp_mat_b', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.002': { name: 'jp_slat_mat', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.003': { name: 'jp_wood_bench', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.009': { name: 'jp_table_geo', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'Cube.010': { name: 'jp_art_roofs', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.011': { name: 'jp_art_street', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'Cube.012': { name: 'jp_shelf_ledge', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.013': { name: 'jp_knit_pillow', mode: 'bake', texMax: TEX_DEFAULT },
      Cylinder: { name: 'jp_rug_round', mode: 'bake', texMax: TEX_DEFAULT },
      Sphere: { name: 'jp_paper_lantern', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.005': { name: 'jp_art_py', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.006': { name: 'jp_art_wind', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.007': { name: 'jp_art_py2', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.008': { name: 'jp_art_wind2', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'architecture Planes/Cubes, Point lights; JP siblings deduped'
  },
  {
    id: 'l6',
    file: 'loft_interior_6_for_free.glb',
    pieces: {
      // Living + kitchen furniture (skip room shell / HDRI / Sun)
      node_0: { name: 'l6_sofa', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.001': { name: 'l6_kitchen', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.002': { name: 'l6_dining', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.003': { name: 'l6_cabinet', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.004': { name: 'l6_sofa_b', mode: 'bake', texMax: TEX_DEFAULT }, // .005 dupe
      'node_0.006': { name: 'l6_tray', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.002': { name: 'l6_coffee_a', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.007': { name: 'l6_coffee_b', mode: 'bake', texMax: TEX_DEFAULT },
      Cylinder: { name: 'l6_island', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.002': { name: 'l6_rug', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.005': { name: 'l6_art_tall', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.007': { name: 'l6_art', mode: 'bake', texMax: TEX_DEFAULT } // .008–.011 similar
    },
    skipNote: 'Cube/Cube.001/003–006/008 walls+beams, Plane floor/ceil/windows, Sphere HDRI, Sun; sofa_b/art siblings deduped'
  },
  {
    id: 'l2',
    file: 'loft2_free_interior.glb',
    pieces: {
      'node_0.001': { name: 'l2_coffee', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.004': { name: 'l2_plant', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.005': { name: 'l2_chair', mode: 'bake', texMax: TEX_DEFAULT }, // .006/.007 dupe
      'node_0.008': { name: 'l2_bust', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.002': { name: 'l2_side_table', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.003': { name: 'l2_art', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.005': { name: 'l2_pedestal', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.010': { name: 'l2_rug', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      Sphere: { name: 'l2_pendant', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'Cube.006/008/009 window frames, metal pipe Cylinders, floor/wall Planes, Camera/Point/Spot; LC3 chairs deduped'
  },
  {
    id: 'l13',
    file: 'loft_13_living_room_interior.glb',
    pieces: {
      node_0: { name: 'l13_sofa', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.001': { name: 'l13_chair_a', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.002': { name: 'l13_chair_b', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.003': { name: 'l13_ottoman', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.004': { name: 'l13_decor_small', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.005': { name: 'l13_chair_c', mode: 'bake', texMax: TEX_DEFAULT }, // .006 rotated dupe-ish
      'node_0.007': { name: 'l13_table', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.008': { name: 'l13_console', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.002': { name: 'l13_rug', mode: 'bake', texMax: TEX_DEFAULT },
      'Cylinder.002': { name: 'l13_plant_a', mode: 'bake', texMax: TEX_DEFAULT },
      'Cylinder.003': { name: 'l13_plant_b', mode: 'bake', texMax: TEX_DEFAULT },
      'Cylinder.006': { name: 'l13_pot', mode: 'bake', texMax: TEX_DEFAULT },
      'Cylinder.010': { name: 'l13_plant_c', mode: 'bake', texMax: TEX_DEFAULT },
      'af939a6810faf504959fd49dac667515-no-bg-preview (carve.photos)': {
        name: 'l13_pillow_a',
        mode: 'bake',
        texMax: TEX_DEFAULT
      },
      'af939a6810faf504959fd49dac667515-no-bg-preview (carve.photos).001': {
        name: 'l13_pillow_b',
        mode: 'bake',
        texMax: TEX_DEFAULT
      },
      'bb1df458974c08eead98c145cac0afff-no-bg-preview (carve.photos).001': {
        name: 'l13_art_carve',
        mode: 'bake',
        texMax: TEX_DEFAULT
      }
    },
    skipNote: 'Plane room shell, Cube ceiling beams, Sphere lights-as-mesh, Point lights, photo wall planes'
  },
  {
    id: 'bed',
    file: 'interior_8_bedroom.glb',
    pieces: {
      node_0: { name: 'bed_platform', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.001': { name: 'bed_plant', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.002': { name: 'bed_egg_chair', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'Plane.003': { name: 'bed_rug', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.007': { name: 'bed_art_a', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.008': { name: 'bed_art_b', mode: 'bake', texMax: TEX_DEFAULT },
      Cylinder: { name: 'bed_pendant', mode: 'bake', texMax: TEX_DEFAULT }, // .001 dupe
      'Cube.001': { name: 'bed_nightstand', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.003': { name: 'bed_books', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'Cube/Cube.007 room shell, floor/wall Planes, Point lights; pendant sibling deduped'
  },
  {
    id: 'mini',
    file: 'interior_15_mini_loft.glb',
    pieces: {
      node_0: { name: 'mini_sofa', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.001': { name: 'mini_lounge', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.002': { name: 'mini_table', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.003': { name: 'mini_console', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.004': { name: 'mini_shelf', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      Cube: { name: 'mini_kitchen', mode: 'bake', texMax: TEX_DEFAULT },
      'Cube.002': { name: 'mini_coffee', mode: 'bake', texMax: TEX_DEFAULT },
      'Plane.001': { name: 'mini_rug', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'Plane room shell, Sphere HDRI, wall art Planes.002/.004'
  },
  {
    id: 'i9',
    file: 'interior_9_free_with_cars.glb',
    pieces: {
      // SKIP node_0 + node_0.001 (cars — steering-wheel atlases)
      'node_0.002': { name: 'i9_rack', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'node_0.003': { name: 'i9_tire_rack', mode: 'bake', texMax: TEX_DEFAULT },
      'node_0.004': { name: 'i9_bed', mode: 'bake', texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
      'Plane.004': { name: 'i9_rug', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'CARS node_0 + node_0.001 skipped; architecture Planes/Cubes, Point lights, garage door Plane.005'
  },
  {
    id: 'shelf',
    file: 'loft_style_shelfs.glb',
    pieces: {
      'Shelf 1': { name: 'shelf_1', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 2': { name: 'shelf_2', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 3': { name: 'shelf_3', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 4': { name: 'shelf_4', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 5.002': { name: 'shelf_5', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 6': { name: 'shelf_6', mode: 'bake', texMax: TEX_DEFAULT },
      'Shelf 7': { name: 'shelf_7', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'none — all shelf units are furniture'
  },
  {
    id: 'chair2',
    file: 'loft_style_chairs.glb',
    pieces: {
      // Prefer Beweld high-poly when duplicate silhouette exists
      Chair_1_0_ALIAS: null, // placeholder removed below
      'Chair 1_0': { name: 'chair2_1', mode: 'bake', texMax: TEX_DEFAULT },
      'Chair 2 Beweld_1': { name: 'chair2_2', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'Chair 3 Beweld_7': { name: 'chair2_3', mode: 'bake', texMax: TEX_HERO, texFormat: 'png' },
      'Chair 4_3': { name: 'chair2_4', mode: 'bake', texMax: TEX_DEFAULT },
      'Chair 5 Beweld_6': { name: 'chair2_5', mode: 'bake', texMax: TEX_DEFAULT },
      'Chair 6_5': { name: 'chair2_6', mode: 'bake', texMax: TEX_DEFAULT }
    },
    skipNote: 'low-poly Chair 2_8 / 3_2 / 5_4 skipped (Beweld kept)'
  },
  {
    id: 'clock',
    file: 'vintage_stand_clock.glb',
    combine: {
      name: 'clock_stand',
      roots: ['Clock_Exterior', 'Pendalo', 'Clock'],
      mode: 'bake',
      texMax: TEX_HERO,
      texFormat: 'png'
    },
    pieces: {},
    skipNote: 'none — whole clock assembled as one piece'
  }
];

// clean placeholder
delete PACKS.find((p) => p.id === 'chair2').pieces.Chair_1_0_ALIAS;

function rxNeg90(arr) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i],
      y = arr[i + 1],
      z = arr[i + 2];
    out[i] = x;
    out[i + 1] = z;
    out[i + 2] = -y;
  }
  return out;
}
function rxNeg90N(arr) {
  const out = rxNeg90(arr);
  for (let i = 0; i < out.length; i += 3) {
    const len = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= len;
    out[i + 1] /= len;
    out[i + 2] /= len;
  }
  return out;
}

function nodeMatrix(node) {
  const m = node.getMatrix();
  if (
    m &&
    !(
      m[0] === 1 &&
      m[5] === 1 &&
      m[10] === 1 &&
      m[15] === 1 &&
      [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14].every((i) => m[i] === 0)
    )
  ) {
    return new THREE.Matrix4().fromArray(m);
  }
  const t = node.getTranslation() || [0, 0, 0];
  const r = node.getRotation() || [0, 0, 0, 1];
  const s = node.getScale() || [1, 1, 1];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...t),
    new THREE.Quaternion(...r),
    new THREE.Vector3(...s)
  );
}

function findNamed(root, name) {
  let hit = null;
  function walk(n) {
    if (n.getName() === name) hit = n;
    for (const c of n.listChildren()) walk(c);
  }
  for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n);
  return hit;
}

function collectLocalPrims(pieceNode) {
  const prims = [];
  function walk(n) {
    const mesh = n.getMesh();
    if (mesh) for (const p of mesh.listPrimitives()) prims.push(p);
    for (const c of n.listChildren()) walk(c);
  }
  walk(pieceNode);
  return prims;
}

/** Bake every mesh under `roots` into full world space (incl. Sketchfab 0.01). */
function collectBakedPrims(roots) {
  function worldOf(node) {
    const chain = [];
    let cur = node;
    const guard = new Set();
    while (cur && cur.propertyType === 'Node' && !guard.has(cur)) {
      guard.add(cur);
      chain.push(cur);
      const ps = cur.listParents().filter((p) => p.propertyType === 'Node');
      cur = ps[0] || null;
    }
    const w = new THREE.Matrix4();
    for (let i = chain.length - 1; i >= 0; i--) w.multiply(nodeMatrix(chain[i]));
    return w;
  }

  const baked = [];

  function walk(n) {
    const mesh = n.getMesh();
    if (mesh) {
      const rel = worldOf(n);
      const normalMat = new THREE.Matrix3().getNormalMatrix(rel);
      for (const prim of mesh.listPrimitives()) {
        const posAcc = prim.getAttribute('POSITION');
        if (!posAcc) continue;
        const src = posAcc.getArray();
        const arr = new Float32Array(src.length);
        const v = new THREE.Vector3();
        for (let i = 0; i < src.length; i += 3) {
          v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(rel);
          arr[i] = v.x;
          arr[i + 1] = v.y;
          arr[i + 2] = v.z;
        }
        let nArr = null;
        const nrm = prim.getAttribute('NORMAL');
        if (nrm) {
          const ns = nrm.getArray();
          nArr = new Float32Array(ns.length);
          const vn = new THREE.Vector3();
          for (let i = 0; i < ns.length; i += 3) {
            vn.set(ns[i], ns[i + 1], ns[i + 2]).applyMatrix3(normalMat).normalize();
            nArr[i] = vn.x;
            nArr[i + 1] = vn.y;
            nArr[i + 2] = vn.z;
          }
        }
        let uvArr = null;
        const uv = prim.getAttribute('TEXCOORD_0');
        if (uv) uvArr = new Float32Array(uv.getArray());
        let idxArr = null;
        const idx = prim.getIndices();
        if (idx) {
          const a = idx.getArray();
          idxArr = a.slice ? a.slice() : new a.constructor(a);
        }
        baked.push({ arr, nArr, uvArr, idxArr, material: prim.getMaterial(), mode: prim.getMode() });
      }
    }
    for (const c of n.listChildren()) walk(c);
  }
  for (const r of roots) walk(r);
  return baked;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('novopo_furniture');
const matMap = new Map();
const texMap = new Map();
const packCounts = {};

function rank(opts) {
  const max = opts.texMax || TEX_DEFAULT;
  const fmt = opts.texFormat === 'png' ? 2 : 1;
  return max * 10 + fmt;
}

async function cloneTexture(tex, opts = {}) {
  if (!tex) return null;
  const texMax = opts.texMax || TEX_DEFAULT;
  const texFormat = opts.texFormat || 'jpeg';
  const brighten = opts.brighten || 1;
  const cacheKey = `${texMax}:${texFormat}:${brighten}`;
  if (texMap.has(tex)) {
    const cached = texMap.get(tex);
    if (cached._optsKey === cacheKey || cached._rank >= rank(opts)) return cached.nt;
  }
  let img = tex.getImage();
  let mime = tex.getMimeType() || 'image/png';
  if (img) {
    const meta = await sharp(Buffer.from(img)).metadata();
    const w = meta.width || texMax;
    const h = meta.height || texMax;
    const scale = Math.min(1, texMax / Math.max(w, h));
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    let pipeline = sharp(Buffer.from(img)).resize(nw, nh, { fit: 'inside' });
    if (brighten !== 1) pipeline = pipeline.linear(brighten, 0);
    if (texFormat === 'png') {
      img = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      mime = 'image/png';
    } else {
      img = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      mime = 'image/jpeg';
    }
  }
  const nt = doc.createTexture(tex.getName() || 'albedo').setImage(img).setMimeType(mime);
  texMap.set(tex, { nt, _optsKey: cacheKey, _rank: rank(opts) });
  return nt;
}

async function cloneMaterial(mat, opts = {}) {
  if (!mat) {
    return doc
      .createMaterial('fallback')
      .setBaseColorFactor([0.6, 0.6, 0.6, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
  }
  const key = `${mat.getName() || 'mat'}::${opts.texMax || TEX_DEFAULT}:${opts.texFormat || 'jpeg'}:${opts.brighten || 1}`;
  if (matMap.has(key)) return matMap.get(key);
  const nm = doc
    .createMaterial(mat.getName() || 'mat')
    .setBaseColorFactor(mat.getBaseColorFactor() || [1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(!!mat.getDoubleSided());
  const alpha = mat.getAlphaMode?.();
  if (alpha) nm.setAlphaMode(alpha);
  const opacity = mat.getBaseColorFactor()?.[3];
  if (opacity != null && opacity < 1) nm.setAlphaMode('BLEND');
  const base = mat.getBaseColorTexture();
  if (base) nm.setBaseColorTexture(await cloneTexture(base, opts));
  matMap.set(key, nm);
  return nm;
}

async function emitPiece(pieceName, packId, meta, baked) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const bp of baked) {
    for (let i = 0; i < bp.arr.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], bp.arr[i + c]);
        max[c] = Math.max(max[c], bp.arr[i + c]);
      }
    }
  }
  if (!isFinite(min[0])) {
    console.warn('  EMPTY', pieceName);
    return false;
  }
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const fy = min[1];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size[1] < 1e-4) size[1] = 0.002;
  const texOpts = {
    texMax: meta.texMax || TEX_DEFAULT,
    texFormat: meta.texFormat || 'jpeg',
    brighten: meta.brighten || 1
  };
  console.log(' ', pieceName, 'size', size.map((x) => +x.toFixed(3)), 'prims', baked.length);

  const outMesh = doc.createMesh(pieceName);
  for (const bp of baked) {
    for (let i = 0; i < bp.arr.length; i += 3) {
      bp.arr[i] -= cx;
      bp.arr[i + 1] -= fy;
      bp.arr[i + 2] -= cz;
    }
    if (max[1] - min[1] < 1e-4) {
      for (let i = 0; i < bp.arr.length; i += 3) {
        if (bp.arr[i + 1] < 1e-6) bp.arr[i + 1] = 0;
      }
    }
    const outPrim = doc.createPrimitive().setMode(bp.mode);
    outPrim.setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(bp.arr).setBuffer(buffer)
    );
    if (bp.nArr)
      outPrim.setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(bp.nArr).setBuffer(buffer)
      );
    if (bp.uvArr)
      outPrim.setAttribute(
        'TEXCOORD_0',
        doc.createAccessor().setType('VEC2').setArray(bp.uvArr).setBuffer(buffer)
      );
    if (bp.idxArr) {
      const ctor = bp.idxArr.constructor;
      outPrim.setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new ctor(bp.idxArr)).setBuffer(buffer)
      );
    }
    outPrim.setMaterial(await cloneMaterial(bp.material, texOpts));
    outMesh.addPrimitive(outPrim);
  }
  const node = doc.createNode(pieceName).setMesh(outMesh);
  node.setExtras({
    size: size.map((x) => +x.toFixed(4)),
    loftPiece: pieceName,
    pack: packId
  });
  scene.addChild(node);
  packCounts[packId] = (packCounts[packId] || 0) + 1;
  return true;
}

function primsToBakedLocal(prims, zUp) {
  const baked = [];
  for (const prim of prims) {
    const posAcc = prim.getAttribute('POSITION');
    if (!posAcc) continue;
    let arr = new Float32Array(posAcc.getArray());
    if (zUp) arr = rxNeg90(arr);
    let nArr = null;
    const nrm = prim.getAttribute('NORMAL');
    if (nrm) {
      nArr = new Float32Array(nrm.getArray());
      if (zUp) nArr = rxNeg90N(nArr);
    }
    let uvArr = null;
    const uv = prim.getAttribute('TEXCOORD_0');
    if (uv) uvArr = new Float32Array(uv.getArray());
    let idxArr = null;
    const idx = prim.getIndices();
    if (idx) {
      const a = idx.getArray();
      idxArr = a.slice ? a.slice() : new a.constructor(a);
    }
    baked.push({ arr, nArr, uvArr, idxArr, material: prim.getMaterial(), mode: prim.getMode() });
  }
  return baked;
}

for (const pack of PACKS) {
  const path = `${SRC_DIR}/${pack.file}`;
  if (!fs.existsSync(path)) {
    console.warn('MISSING', path);
    continue;
  }
  console.log('\n====', pack.id, pack.file);
  // Reset tex/mat maps per pack so shared atlases don't cross-contaminate rank across packs
  texMap.clear();
  matMap.clear();
  const src = await io.read(path);
  const root = src.getRoot();

  if (pack.combine) {
    const roots = pack.combine.roots.map((n) => findNamed(root, n)).filter(Boolean);
    if (roots.length !== pack.combine.roots.length) {
      console.warn('  combine missing roots', pack.combine.roots);
    } else {
      const baked = collectBakedPrims(roots);
      await emitPiece(pack.combine.name, pack.id, pack.combine, baked);
    }
  }

  for (const [srcName, meta] of Object.entries(pack.pieces)) {
    if (!meta) continue;
    const node = findNamed(root, srcName);
    if (!node) {
      console.warn('  missing', srcName);
      continue;
    }
    let baked;
    if (meta.mode === 'bake') {
      baked = collectBakedPrims([node]);
    } else {
      baked = primsToBakedLocal(collectLocalPrims(node), true);
    }
    await emitPiece(meta.name, pack.id, meta, baked);
  }
  console.log('  skip:', pack.skipNote);
}

await doc.transform(dedup(), prune());
fs.mkdirSync('/workspace/city/public/models/apartments', { recursive: true });
await io.write(OUT, doc);
console.log('\nWrote', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB');
console.log('Pack counts:', packCounts);
console.log(
  'Total pieces',
  Object.values(packCounts).reduce((a, b) => a + b, 0)
);
const check = await io.read(OUT);
console.log(
  'nodes',
  check
    .getRoot()
    .listNodes()
    .map((n) => n.getName())
    .join(', ')
);
