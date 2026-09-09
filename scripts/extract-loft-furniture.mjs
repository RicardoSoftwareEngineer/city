/**
 * Extract loft furniture shortlist → lean centered Y-up GLB.
 * Local mesh axes: most pieces Y-up; lamp+plant+chair+console are Z-up → Rx(-90).
 * Albedo: default 512 JPEG q90; sofa 1024 PNG (dark fabric atlas must stay readable).
 *
 * Coffee (Cube.007) intentionally omitted — that mesh is wall-art canvas (skull texture),
 * not a table. roomTemplate / sandbox use a wood box top + legs instead.
 */
import fs from 'fs';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = process.env.LOFT_SRC || '/workspace/uploads/loft_5_interior_for_free.glb';
const OUT = process.env.LOFT_OUT || '/workspace/city/public/models/apartments/loft_furniture.glb';
const TEX_DEFAULT = 512;
const TEX_SOFA = 1024;

/** parent name → { name, zUp, texMax?, texFormat? } */
const PIECES = {
  // Local FBX axes mix Y-up / Z-up. zUp:true applies Rx(-90) so +Y is up
  // after floor+center. Chair+console were wrongly Y-up → tipped in apartments.
  'node_0.003': { name: 'sofa', zUp: false, texMax: TEX_SOFA, texFormat: 'png', brighten: 1.35 },
  'node_0.004': { name: 'plant', zUp: true, texMax: TEX_DEFAULT },
  'node_0.002': { name: 'console', zUp: true, texMax: TEX_DEFAULT },
  // Cube.007 = wall-art canvas with skull albedo — NOT coffee. Omitted on purpose.
  'Cube.008': { name: 'lamp', zUp: true, texMax: TEX_DEFAULT },
  'node_0.001': { name: 'chair', zUp: true, texMax: TEX_DEFAULT }
};

function rxNeg90(arr) {
  // (x,y,z) -> (x,z,-y)
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
console.log('pieces', [...pieceMeshes.keys()]);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('loft_furniture');
const matMap = new Map();
const texMap = new Map();

async function cloneTexture(tex, opts = {}) {
  if (!tex) return null;
  const texMax = opts.texMax || TEX_DEFAULT;
  const texFormat = opts.texFormat || 'jpeg';
  const brighten = opts.brighten || 1;
  const cacheKey = `${texMax}:${texFormat}:${brighten}`;
  if (texMap.has(tex)) {
    const cached = texMap.get(tex);
    // Prefer higher-res / better format if same tex hit again
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
    if (brighten !== 1) {
      // Linear lift so dark fabric atlas reads under MeshBasic outdoors.
      pipeline = pipeline.linear(brighten, 0);
    }
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

function rank(opts) {
  const max = opts.texMax || TEX_DEFAULT;
  const fmt = opts.texFormat === 'png' ? 2 : 1;
  return max * 10 + fmt;
}

async function cloneMaterial(mat, opts = {}) {
  if (!mat) {
    return doc
      .createMaterial('fallback')
      .setBaseColorFactor([0.6, 0.6, 0.6, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
  }
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
    if (idx) idxArr = idx.getArray().slice ? idx.getArray().slice() : new (idx.getArray().constructor)(idx.getArray());
    baked.push({ arr, nArr, uvArr, idxArr, material: prim.getMaterial(), mode: prim.getMode() });
  }

  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const fy = min[1];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  console.log(pieceName, 'size', size.map((x) => +x.toFixed(3)), 'tex', texOpts);

  const outMesh = doc.createMesh(pieceName);
  for (const bp of baked) {
    for (let i = 0; i < bp.arr.length; i += 3) {
      bp.arr[i] -= cx;
      bp.arr[i + 1] -= fy;
      bp.arr[i + 2] -= cz;
    }
    const outPrim = doc.createPrimitive().setMode(bp.mode);
    outPrim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(bp.arr).setBuffer(buffer));
    if (bp.nArr) outPrim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(bp.nArr).setBuffer(buffer));
    if (bp.uvArr) outPrim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(bp.uvArr).setBuffer(buffer));
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
console.log('nodes', check.getRoot().listNodes().map((n) => n.getName() + ' ' + JSON.stringify(n.getExtras())));
console.log('tex', check.getRoot().listTextures().length, 'mats', check.getRoot().listMaterials().length);
for (const t of check.getRoot().listTextures()) {
  const img = t.getImage();
  if (!img) continue;
  const meta = await sharp(Buffer.from(img)).metadata();
  console.log('  out-tex', t.getName(), meta.width, 'x', meta.height, t.getMimeType(), (img.byteLength / 1024).toFixed(1) + 'KB');
}
