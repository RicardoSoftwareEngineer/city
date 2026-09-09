/**
 * Extract ALL loft furniture/decor → lean centered Y-up GLB (no architecture).
 *
 * Critical remap (visual node renders, Sep 2026):
 *   sofa     = node_0      (grey L-sectional + orange pillows) — NOT node_0.003
 *   coffee   = Cube.008    (wood slat + black metal) — NOT a lamp
 *   bar      = node_0.003  (glass-front display cabinet; was wrongly "sofa")
 *   wallart  = Cube.007    (skull painting)
 *   rug      = Plane.003
 *   tray     = node_0.005  (decor tray)
 *   chair/console/plant = node_0.001 / .002 / .004 (unchanged)
 *
 * Skip architecture: Cube–Cube.005, Plane/Plane.001/002/004–006, Point lights.
 * No separable floor lamp — dome lamp is baked into `bar`.
 *
 * All FBX furniture parents use Rx(-90) + scale 100 → local meshes are Z-up;
 * extract applies Rx(-90) so output is floored Y-up. Albedo: default 512 JPEG;
 * sofa/bar 1024 PNG. Runtime uses MeshBasic.
 */
import fs from 'fs';
import { createRequire } from 'module';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';

// Prefer project-local sharp, then /tmp/loft-tools, then npx cache.
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

const SRC = process.env.LOFT_SRC || '/workspace/uploads/loft_5_interior_for_free.glb';
const OUT = process.env.LOFT_OUT || '/workspace/city/public/models/apartments/loft_furniture.glb';
const TEX_DEFAULT = 512;
const TEX_HERO = 1024;

/** parent name → { name, zUp, texMax?, texFormat?, brighten? } */
const PIECES = {
  // Real grey L-sofa (Material.005 / atlas img_11). Parent Rx(-90) → zUp.
  'node_0': { name: 'sofa', zUp: true, texMax: TEX_HERO, texFormat: 'png', brighten: 1.05 },
  // Sling chair: same FBX Rx(-90) as sofa. After extract, depth (Z) can exceed
  // height (Y) — that is upright, not Z-tall. Do NOT flip zUp false.
  'node_0.001': { name: 'chair', zUp: true, texMax: TEX_DEFAULT },
  'node_0.002': { name: 'console', zUp: true, texMax: TEX_DEFAULT },
  // Bar/display cabinet (was wrongly mapped as sofa).
  'node_0.003': { name: 'bar', zUp: true, texMax: TEX_HERO, texFormat: 'png' },
  'node_0.004': { name: 'plant', zUp: true, texMax: TEX_DEFAULT },
  'node_0.005': { name: 'tray', zUp: true, texMax: TEX_DEFAULT },
  // Wood+metal coffee table (was wrongly mapped as lamp).
  'Cube.008': { name: 'coffee', zUp: true, texMax: TEX_DEFAULT },
  // Skull wall art canvas.
  'Cube.007': { name: 'wallart', zUp: true, texMax: TEX_DEFAULT },
  // Area rug (flat plane).
  'Plane.003': { name: 'rug', zUp: true, texMax: TEX_DEFAULT }
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
const scene = doc.createScene('loft_furniture');
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
  // Materials can be shared across pieces — clone per opts via composite key.
  const key = mat;
  // Always clone fresh when opts differ; simple path: one mat → one clone (pieces don't share mats here).
  if (matMap.has(mat)) return matMap.get(mat);
  const nm = doc
    .createMaterial(mat.getName() || 'mat')
    .setBaseColorFactor(mat.getBaseColorFactor() || [1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(!!mat.getDoubleSided());
  const base = mat.getBaseColorTexture();
  if (base) nm.setBaseColorTexture(await cloneTexture(base, opts));
  matMap.set(mat, nm);
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
  // Guard zero-thickness rugs / planes
  if (size[1] < 1e-4) size[1] = 0.002;
  console.log(pieceName, 'size', size.map((x) => +x.toFixed(3)), 'tex', texOpts);

  const outMesh = doc.createMesh(pieceName);
  for (const bp of baked) {
    for (let i = 0; i < bp.arr.length; i += 3) {
      bp.arr[i] -= cx;
      bp.arr[i + 1] -= fy;
      bp.arr[i + 2] -= cz;
    }
    // Nudge zero-thickness planes so they have a tiny Y extent for ray/AABB.
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
  node.setExtras({ size: size.map((x) => +x.toFixed(4)), loftPiece: pieceName });
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
