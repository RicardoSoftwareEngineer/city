/**
 * @deprecated Prefer `scripts/extract-novopo-packs.mjs` (all packs).
 * Extract Japanese loft furniture/decor → lean floored Y-up GLB (no architecture).
 *
 * Source: loft_japanese_11_free_interior (Sketchfab free / novopo).
 * Same FBX pattern as loft_5: parent Rx(-90)+scale100 under fbx scale 0.01 →
 * local mesh metres are Z-up; extract applies Rx(-90). Albedo 512 JPEG default;
 * hero pieces 1024 PNG. Runtime MeshBasic.
 *
 * Dedupe identical siblings (5 cushions → 1, 4 knit pillows → 1, etc.).
 */
import fs from 'fs';
import { createRequire } from 'module';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';

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

const SRC =
  process.env.NOVOPO_SRC ||
  '/workspace/uploads/novopo-interiors/loft_japanese_11_free_interior.glb';
const OUT =
  process.env.NOVOPO_OUT ||
  '/workspace/city/public/models/apartments/novopo_furniture.glb';
const TEX_DEFAULT = 512;
const TEX_HERO = 1024;

/** parent name → { name, zUp, texMax?, texFormat?, brighten? } */
const PIECES = {
  // Olive floor cushions (node_0…004 identical — keep one)
  node_0: { name: 'jp_cushion', zUp: true, texMax: TEX_DEFAULT },
  // Ornate tea ceremony table + set
  'node_0.005': { name: 'jp_tea_set', zUp: true, texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
  // Standing geisha doll on pedestal
  'node_0.006': { name: 'jp_geisha', zUp: true, texMax: TEX_HERO, texFormat: 'png' },
  // Circular moongate / curio shelf with decor
  'node_0.007': { name: 'jp_moongate', zUp: true, texMax: TEX_HERO, texFormat: 'png' },
  // Yukimi-doro stone lantern
  'node_0.008': { name: 'jp_stone_lantern', zUp: true, texMax: TEX_DEFAULT },
  // Woven rectangular mats (slightly different sizes)
  Cube: { name: 'jp_mat_a', zUp: true, texMax: TEX_DEFAULT },
  'Cube.001': { name: 'jp_mat_b', zUp: true, texMax: TEX_DEFAULT },
  // Wood slat platform / bath mat
  'Cube.002': { name: 'jp_slat_mat', zUp: true, texMax: TEX_DEFAULT },
  // Twin dark wood low benches
  'Cube.003': { name: 'jp_wood_bench', zUp: true, texMax: TEX_DEFAULT },
  // Dark geometric coffee / media table
  'Cube.009': { name: 'jp_table_geo', zUp: true, texMax: TEX_HERO, texFormat: 'png' },
  // Framed wall art
  'Cube.010': { name: 'jp_art_roofs', zUp: true, texMax: TEX_DEFAULT },
  'Cube.011': { name: 'jp_art_street', zUp: true, texMax: TEX_HERO, texFormat: 'png' },
  // Dark wood picture ledge (Cube.015 duplicate)
  'Cube.012': { name: 'jp_shelf_ledge', zUp: true, texMax: TEX_DEFAULT },
  // Knit/woven throw pillow (013/014/016/017 duplicates)
  'Cube.013': { name: 'jp_knit_pillow', zUp: true, texMax: TEX_DEFAULT },
  // Round sisal/jute rug
  Cylinder: { name: 'jp_rug_round', zUp: true, texMax: TEX_DEFAULT },
  // Paper lantern shade (Sphere.001 similar)
  Sphere: { name: 'jp_paper_lantern', zUp: true, texMax: TEX_DEFAULT },
  // Framed posters (Plane.005–008)
  'Plane.005': { name: 'jp_art_py', zUp: true, texMax: TEX_DEFAULT },
  'Plane.006': { name: 'jp_art_wind', zUp: true, texMax: TEX_DEFAULT },
  'Plane.007': { name: 'jp_art_py2', zUp: true, texMax: TEX_DEFAULT },
  'Plane.008': { name: 'jp_art_wind2', zUp: true, texMax: TEX_DEFAULT }
};

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

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(SRC);
const root = src.getRoot();

const pieceMeshes = new Map();
function findPieces(node, current) {
  const name = node.getName();
  let piece = current;
  if (PIECES[name]) piece = PIECES[name];
  const mesh = node.getMesh();
  if (mesh && piece) {
    if (!pieceMeshes.has(piece.name)) pieceMeshes.set(piece.name, { meta: piece, prims: [] });
    for (const prim of mesh.listPrimitives()) {
      pieceMeshes.get(piece.name).prims.push(prim);
    }
  }
  for (const c of node.listChildren()) findPieces(c, piece);
}
for (const s of root.listScenes()) for (const n of s.listChildren()) findPieces(n, null);
console.log(
  'pieces',
  [...pieceMeshes.entries()].map(([k, v]) => `${k}(${v.prims.length}prim)`)
);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('novopo_furniture');
const matMap = new Map();
const texMap = new Map();

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
    console.log(`  tex ${w}x${h} → ${nw}x${nh} ${mime} brighten=${brighten}`);
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
  // Materials can be shared across pieces — clone per piece via composite key.
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
  if (opacity != null && opacity < 1) {
    nm.setAlphaMode('BLEND');
  }
  const base = mat.getBaseColorTexture();
  if (base) nm.setBaseColorTexture(await cloneTexture(base, opts));
  matMap.set(key, nm);
  return nm;
}

for (const [pieceName, { meta, prims }] of pieceMeshes) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const baked = [];
  const texOpts = {
    texMax: meta.texMax || TEX_DEFAULT,
    texFormat: meta.texFormat || 'jpeg',
    brighten: meta.brighten || 1
  };

  for (const prim of prims) {
    const posAcc = prim.getAttribute('POSITION');
    if (!posAcc) continue;
    let arr = new Float32Array(posAcc.getArray());
    if (meta.zUp) arr = rxNeg90(arr);
    for (let i = 0; i < arr.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], arr[i + c]);
        max[c] = Math.max(max[c], arr[i + c]);
      }
    }
    let nArr = null;
    const nrm = prim.getAttribute('NORMAL');
    if (nrm) {
      nArr = new Float32Array(nrm.getArray());
      if (meta.zUp) nArr = rxNeg90N(nArr);
    }
    let uvArr = null;
    const uv = prim.getAttribute('TEXCOORD_0');
    if (uv) uvArr = new Float32Array(uv.getArray());
    let idxArr = null;
    const idx = prim.getIndices();
    if (idx)
      idxArr = idx.getArray().slice
        ? idx.getArray().slice()
        : new (idx.getArray().constructor)(idx.getArray());
    baked.push({ arr, nArr, uvArr, idxArr, material: prim.getMaterial(), mode: prim.getMode() });
  }

  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const fy = min[1];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size[1] < 1e-4) size[1] = 0.002;
  console.log(pieceName, 'size', size.map((x) => +x.toFixed(3)), 'tex', texOpts);

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
    outPrim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(bp.arr).setBuffer(buffer));
    if (bp.nArr)
      outPrim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(bp.nArr).setBuffer(buffer));
    if (bp.uvArr)
      outPrim.setAttribute(
        'TEXCOORD_0',
        doc.createAccessor().setType('VEC2').setArray(bp.uvArr).setBuffer(buffer)
      );
    if (bp.idxArr) {
      const ctor = bp.idxArr.constructor;
      outPrim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new ctor(bp.idxArr)).setBuffer(buffer));
    }
    outPrim.setMaterial(await cloneMaterial(bp.material, texOpts));
    outMesh.addPrimitive(outPrim);
  }
  const node = doc.createNode(pieceName).setMesh(outMesh);
  node.setExtras({ size: size.map((x) => +x.toFixed(4)), loftPiece: pieceName, pack: 'jp11' });
  scene.addChild(node);
}

await doc.transform(dedup(), prune());
fs.mkdirSync('/workspace/city/public/models/apartments', { recursive: true });
await io.write(OUT, doc);
console.log('Wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
const check = await io.read(OUT);
console.log(
  'nodes',
  check
    .getRoot()
    .listNodes()
    .map((n) => n.getName() + ' ' + JSON.stringify(n.getExtras()))
);
console.log('tex', check.getRoot().listTextures().length, 'mats', check.getRoot().listMaterials().length);
for (const t of check.getRoot().listTextures()) {
  const img = t.getImage();
  if (!img) continue;
  const meta = await sharp(Buffer.from(img)).metadata();
  console.log(
    '  out-tex',
    t.getName(),
    meta.width,
    'x',
    meta.height,
    t.getMimeType(),
    (img.byteLength / 1024).toFixed(1) + 'KB'
  );
}
