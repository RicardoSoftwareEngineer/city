/**
 * Merge Quaternius (CC0) + Poly Haven (CC0) apartment kit pieces →
 * floored Y-up lean GLB at public/models/apartments/kit/furniture_kit.glb
 *
 * Quaternius: Ultimate House Interior Pack (OpenGameArt / quaternius.com) FBX→GLB
 * Poly Haven: Sofa_01, Television_01, Shelf_01, CoffeeTable_01 (1k diffuse)
 * Aquarium: none solid CC0 found — skip (proxy optional later)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';

const require = createRequire(import.meta.url);
let sharp;
for (const p of ['/tmp/loft-tools/node_modules/sharp', 'sharp']) {
  try {
    sharp = require(p);
    break;
  } catch {}
}

const RAW = process.env.KIT_RAW || '/workspace/uploads/apt-kit/glb-raw';
const OUT =
  process.env.KIT_OUT || '/workspace/city/public/models/apartments/kit/furniture_kit.glb';
const TEX_MAX = 512;

/** @type {Record<string, { src: string, zUp?: boolean, texMax?: number }>} */
const PIECES = {
  fridge: { src: 'Kitchen_Fridge.glb', zUp: true },
  oven: { src: 'Kitchen_Oven.glb', zUp: true },
  oven_large: { src: 'Kitchen_Oven_Large.glb', zUp: true },
  sink: { src: 'Kitchen_Sink.glb', zUp: true },
  cabinet: { src: 'Kitchen_Cabinet1.glb', zUp: true },
  q_couch: { src: 'Couch_Medium1.glb', zUp: true },
  q_couch_s: { src: 'Couch_Small1.glb', zUp: true },
  q_chair: { src: 'Chair_1.glb', zUp: true },
  q_plant: { src: 'Houseplant_1.glb', zUp: true },
  q_plant_b: { src: 'Houseplant_3.glb', zUp: true },
  q_bookshelf: { src: 'Bookshelf.glb', zUp: true },
  q_table: { src: 'Table_RoundLarge.glb', zUp: true },
  q_table_s: { src: 'Table_RoundSmall.glb', zUp: true },
  ph_sofa: { src: 'ph_Sofa_01.glb', zUp: false, texMax: 512 },
  ph_tv: { src: 'ph_Television_01.glb', zUp: false, texMax: 512 },
  ph_shelf: { src: 'ph_Shelf_01.glb', zUp: false, texMax: 512 },
  ph_coffee: { src: 'ph_CoffeeTable_01.glb', zUp: false, texMax: 512 }
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
const outDoc = new Document();
const outRoot = outDoc.getRoot();
const buffer = outDoc.createBuffer();
const pieceNames = [];

for (const [pieceName, meta] of Object.entries(PIECES)) {
  const srcPath = path.join(RAW, meta.src);
  if (!fs.existsSync(srcPath)) {
    console.warn('missing', srcPath);
    continue;
  }
  const src = await io.read(srcPath);
  const sroot = src.getRoot();

  // Collect all primitives with world-ish positions (flatten)
  /** @type {{pos:Float32Array, nrm?:Float32Array, uv?:Float32Array, indices?:Uint32Array, color?:number[], mapBytes?:Buffer, mapMime?:string}[]} */
  const prims = [];

  for (const mesh of sroot.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION');
      if (!posAcc) continue;
      let pos = new Float32Array(posAcc.getArray());
      let nrm = prim.getAttribute('NORMAL')
        ? new Float32Array(prim.getAttribute('NORMAL').getArray())
        : null;
      let uv = prim.getAttribute('TEXCOORD_0')
        ? new Float32Array(prim.getAttribute('TEXCOORD_0').getArray())
        : null;
      const idxAcc = prim.getIndices();
      const indices = idxAcc ? new Uint32Array(idxAcc.getArray()) : null;

      if (meta.zUp) {
        pos = rxNeg90(pos);
        if (nrm) nrm = rxNeg90N(nrm);
      }

      const mat = prim.getMaterial();
      let color = [1, 1, 1, 1];
      let mapBytes = null;
      let mapMime = 'image/jpeg';
      if (mat) {
        const base = mat.getBaseColorFactor?.() || mat.getBaseColorFactor();
        if (base) color = [...base];
        const tex = mat.getBaseColorTexture?.() || mat.getBaseColorTexture();
        if (tex) {
          const img = tex.getImage ? tex : tex;
          // gltf-transform Texture → getImage on texture
          const image = typeof tex.getImage === 'function' ? tex.getImage() : null;
          // Actually Material.getBaseColorTexture returns Texture
          const texObj = mat.getBaseColorTexture();
          if (texObj) {
            const raw = texObj.getImage();
            if (raw) {
              let bytes = Buffer.from(raw);
              const max = meta.texMax || TEX_MAX;
              mapMime = texObj.getMimeType() || 'image/jpeg';
              if (sharp) {
                try {
                  bytes = await sharp(bytes)
                    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                  mapMime = 'image/jpeg';
                } catch {}
              }
              mapBytes = bytes;
            }
          }
        }
      }
      prims.push({ pos, nrm, uv, indices, color, mapBytes, mapMime });
    }
  }

  if (!prims.length) {
    console.warn('no prims', pieceName);
    continue;
  }

  // Merge bounds, floor + center XZ
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of prims) {
    for (let i = 0; i < p.pos.length; i += 3) {
      minX = Math.min(minX, p.pos[i]);
      maxX = Math.max(maxX, p.pos[i]);
      minY = Math.min(minY, p.pos[i + 1]);
      maxY = Math.max(maxY, p.pos[i + 1]);
      minZ = Math.min(minZ, p.pos[i + 2]);
      maxZ = Math.max(maxZ, p.pos[i + 2]);
    }
  }
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  for (const p of prims) {
    for (let i = 0; i < p.pos.length; i += 3) {
      p.pos[i] -= cx;
      p.pos[i + 1] -= minY;
      p.pos[i + 2] -= cz;
    }
  }
  const size = [maxX - minX, maxY - minY, maxZ - minZ];

  const outMesh = outDoc.createMesh(pieceName);
  for (let pi = 0; pi < prims.length; pi++) {
    const p = prims[pi];
    const outPrim = outDoc.createPrimitive();
    outPrim.setAttribute(
      'POSITION',
      outDoc.createAccessor().setType('VEC3').setArray(p.pos).setBuffer(buffer)
    );
    if (p.nrm)
      outPrim.setAttribute(
        'NORMAL',
        outDoc.createAccessor().setType('VEC3').setArray(p.nrm).setBuffer(buffer)
      );
    if (p.uv)
      outPrim.setAttribute(
        'TEXCOORD_0',
        outDoc.createAccessor().setType('VEC2').setArray(p.uv).setBuffer(buffer)
      );
    if (p.indices)
      outPrim.setIndices(
        outDoc.createAccessor().setType('SCALAR').setArray(p.indices).setBuffer(buffer)
      );

    const mat = outDoc.createMaterial(`${pieceName}-mat-${pi}`);
    mat.setBaseColorFactor(p.color);
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(0.85);
    if (p.mapBytes) {
      const image = outDoc.createTexture(`${pieceName}-tex-${pi}`).setImage(p.mapBytes).setMimeType(p.mapMime);
      mat.setBaseColorTexture(image);
    }
    outPrim.setMaterial(mat);
    outMesh.addPrimitive(outPrim);
  }

  const node = outDoc.createNode(pieceName).setMesh(outMesh);
  node.setExtras({ size, kit: 'apt-furniture', source: meta.src });
  let scene = outRoot.getDefaultScene() || outRoot.listScenes()[0];
  if (!scene) scene = outDoc.createScene('kit');
  scene.addChild(node);
  pieceNames.push(pieceName);
  console.log('piece', pieceName, 'size', size.map((x) => +x.toFixed(3)));
}

await outDoc.transform(dedup(), prune());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, outDoc);
console.log('wrote', OUT, 'pieces', pieceNames.length, pieceNames.join(', '));
console.log('bytes', fs.statSync(OUT).size);
