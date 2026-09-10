/**
 * Extract novopo cars + architecture → lean floored Y-up GLB (`novopo_extras.glb`).
 *
 * Cars: interior_9 node_0 / node_0.001 (steering-wheel atlases) → car_*.
 * Architecture: separable wall/floor/window/beam/door panels from packs → arch_*.
 * Skip HDRI spheres, Point/Sun/Spot lights, furniture already in novopo_furniture.glb.
 * Dedup identical siblings. Lean textures (arch ≤256 JPEG; cars ≤512 / hero 1024 PNG).
 *
 * Usage:
 *   NODE_PATH=/tmp/loft-tools/node_modules node scripts/extract-novopo-extras.mjs
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
  process.env.NOVOPO_EXTRAS_OUT ||
  '/workspace/city/public/models/apartments/novopo_extras.glb';
const TEX_ARCH = 256;
const TEX_CAR = 512;
const TEX_CAR_HERO = 1024;

/**
 * Pack definitions for cars + architecture only.
 * pieces: parentName → { name, mode:'bake', texMax?, texFormat?, brighten? }
 */
const PACKS = [
  {
    id: 'i9',
    file: 'interior_9_free_with_cars.glb',
    pieces: {
      // Cars (previously skipped)
      node_0: { name: 'car_a', mode: 'bake', texMax: TEX_CAR_HERO, texFormat: 'png', brighten: 1.05 },
      'node_0.001': { name: 'car_b', mode: 'bake', texMax: TEX_CAR_HERO, texFormat: 'png' },
      // Architecture
      Cube: { name: 'arch_i9_slab', mode: 'bake', texMax: TEX_ARCH },
      'Cube.001': { name: 'arch_i9_floor', mode: 'bake', texMax: TEX_ARCH },
      'Plane.001': { name: 'arch_i9_wall', mode: 'bake', texMax: TEX_ARCH },
      'Plane.002': { name: 'arch_i9_windows', mode: 'bake', texMax: TEX_ARCH },
      'Plane.003': { name: 'arch_i9_wall_b', mode: 'bake', texMax: TEX_ARCH },
      'Plane.005': { name: 'arch_i9_garage_door', mode: 'bake', texMax: TEX_ARCH },
      'Plane.007': { name: 'arch_i9_wall_c', mode: 'bake', texMax: TEX_ARCH }
    },
    skipNote: 'furniture i9_*; Point lights; Plane floor/ceil thin sheets; Cylinder window grid'
  },
  {
    id: 'l6',
    file: 'loft_interior_6_for_free.glb',
    pieces: {
      'Cube.003': { name: 'arch_l6_beam', mode: 'bake', texMax: TEX_ARCH },
      'Cube.004': { name: 'arch_l6_ledge', mode: 'bake', texMax: TEX_ARCH },
      'Cube.005': { name: 'arch_l6_plank', mode: 'bake', texMax: TEX_ARCH },
      'Cube.006': { name: 'arch_l6_window', mode: 'bake', texMax: TEX_ARCH },
      'Plane.004': { name: 'arch_l6_pane', mode: 'bake', texMax: TEX_ARCH } // .006 dupe
    },
    skipNote: 'furniture l6_*; Cube/Cube.001/008 room shells; Plane floor/ceil; Sphere HDRI; Sun; sofa_b twin'
  },
  {
    id: 'l2',
    file: 'loft2_free_interior.glb',
    pieces: {
      'Cube.001': { name: 'arch_l2_beam', mode: 'bake', texMax: TEX_ARCH }, // .010 dupe
      'Cube.004': { name: 'arch_l2_ledge', mode: 'bake', texMax: TEX_ARCH }, // .011 dupe
      'Cube.006': { name: 'arch_l2_window', mode: 'bake', texMax: TEX_ARCH },
      'Cube.009': { name: 'arch_l2_window_b', mode: 'bake', texMax: TEX_ARCH },
      Cylinder: { name: 'arch_l2_pipe', mode: 'bake', texMax: TEX_ARCH }, // metal pipe siblings deduped
      'Plane.001': { name: 'arch_l2_stair', mode: 'bake', texMax: TEX_ARCH } // .006 dupe
    },
    skipNote: 'furniture l2_*; LC3 chair twins; pipe Cylinder siblings; floor/wall Planes; Camera/Point/Spot'
  },
  {
    id: 'l13',
    file: 'loft_13_living_room_interior.glb',
    pieces: {
      Cube: { name: 'arch_l13_beam', mode: 'bake', texMax: TEX_ARCH },
      'Cube.001': { name: 'arch_l13_ceiling', mode: 'bake', texMax: TEX_ARCH },
      'Plane.001': { name: 'arch_l13_plinth', mode: 'bake', texMax: TEX_ARCH }
    },
    skipNote: 'furniture l13_*; Plane room shell; Sphere light meshes; Point/Spot; photo-wall planes'
  },
  {
    id: 'bed',
    file: 'interior_8_bedroom.glb',
    pieces: {
      Cube: { name: 'arch_bed_structure', mode: 'bake', texMax: TEX_ARCH },
      Plane: { name: 'arch_bed_floor', mode: 'bake', texMax: TEX_ARCH },
      'Plane.005': { name: 'arch_bed_window', mode: 'bake', texMax: TEX_ARCH } // .006 dupe
    },
    skipNote: 'furniture bed_*; Cube.007 full shell; pendant twin; Point lights'
  },
  {
    id: 'mini',
    file: 'interior_15_mini_loft.glb',
    pieces: {
      Plane: { name: 'arch_mini_shell', mode: 'bake', texMax: TEX_ARCH },
      'Plane.002': { name: 'arch_mini_window', mode: 'bake', texMax: TEX_ARCH } // .004 similar
    },
    skipNote: 'furniture mini_*; Sphere HDRI; Plane.004 window twin'
  },
  {
    id: 'jp11',
    file: 'loft_japanese_11_free_interior.glb',
    pieces: {
      'Cube.006': { name: 'arch_jp_wall', mode: 'bake', texMax: TEX_ARCH },
      'Cube.007': { name: 'arch_jp_wall_b', mode: 'bake', texMax: TEX_ARCH },
      'Plane.002': { name: 'arch_jp_floor', mode: 'bake', texMax: TEX_ARCH },
      'Plane.003': { name: 'arch_jp_window', mode: 'bake', texMax: TEX_ARCH }
    },
    skipNote: 'furniture jp_*; Cube.004/005 huge floors; Sphere.002 HDRI; cushion/pillow siblings; Point'
  }
];

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
const scene = doc.createScene('novopo_extras');
const matMap = new Map();
const texMap = new Map();
const packCounts = {};
const kindCounts = { car: 0, arch: 0 };

function rank(opts) {
  const max = opts.texMax || TEX_ARCH;
  const fmt = opts.texFormat === 'png' ? 2 : 1;
  return max * 10 + fmt;
}

async function cloneTexture(tex, opts = {}) {
  if (!tex) return null;
  const texMax = opts.texMax || TEX_ARCH;
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
      img = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
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
  const key = `${mat.getName() || 'mat'}::${opts.texMax || TEX_ARCH}:${opts.texFormat || 'jpeg'}:${opts.brighten || 1}`;
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
    texMax: meta.texMax || TEX_ARCH,
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
  const kind = pieceName.startsWith('car_') ? 'car' : 'arch';
  node.setExtras({
    size: size.map((x) => +x.toFixed(4)),
    loftPiece: pieceName,
    pack: packId,
    kind
  });
  scene.addChild(node);
  packCounts[packId] = (packCounts[packId] || 0) + 1;
  kindCounts[kind] = (kindCounts[kind] || 0) + 1;
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
  texMap.clear();
  matMap.clear();
  const src = await io.read(path);
  const root = src.getRoot();

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
console.log('Kind counts:', kindCounts);
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
console.log('tex', check.getRoot().listTextures().length, 'mats', check.getRoot().listMaterials().length);
