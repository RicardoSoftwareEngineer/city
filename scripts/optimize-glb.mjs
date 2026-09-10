#!/usr/bin/env node
/**
 * optimize-glb.mjs — Hybrid GLB import optimization (shared core + category profiles).
 *
 * Spec: docs/specs/08-glb-import.md
 *
 *   node scripts/optimize-glb.mjs --in path.glb --out path.glb \
 *     --profile vehicle-hero|vehicle-npc|building|interior-prop|prop-street \
 *     [--target-tris N] [--report] [--keep-original|--no-keep-original]
 *
 * Core: triage → clean → decimate (profile) → bake materials (TODO Blender) →
 *       compress → quality gate notes. Always keep .original.glb under public/models/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  weld,
  simplify,
  meshopt,
  metalRough,
  palette,
  textureCompress
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

/** Profile defaults — keep in sync with docs/specs/08-glb-import.md */
export const PROFILES = {
  'vehicle-hero': {
    id: 'vehicle-hero',
    label: 'Hero vehicle (drivable)',
    trisBand: [50_000, 120_000],
    defaultTargetTris: 90_000,
    textureMax: 2048,
    texturePreferred: 2048,
    materialsGoal: 3,
    triageLightMax: 150_000,
    triageFullMin: 200_000
  },
  'vehicle-npc': {
    id: 'vehicle-npc',
    label: 'NPC / traffic vehicle',
    trisBand: [8_000, 25_000],
    defaultTargetTris: 15_000,
    textureMax: 2048,
    texturePreferred: 1024,
    materialsGoal: 3,
    triageLightMax: 40_000,
    triageFullMin: 60_000
  },
  building: {
    id: 'building',
    label: 'Building / facade study prop',
    trisBand: [20_000, 80_000],
    defaultTargetTris: 40_000,
    textureMax: 2048,
    texturePreferred: 2048,
    materialsGoal: 4,
    triageLightMax: 100_000,
    triageFullMin: 150_000
  },
  'interior-prop': {
    id: 'interior-prop',
    label: 'Interior furniture / prop',
    trisBand: [5_000, 30_000],
    defaultTargetTris: 15_000,
    textureMax: 2048,
    texturePreferred: 1024,
    materialsGoal: 3,
    triageLightMax: 40_000,
    triageFullMin: 60_000
  },
  'prop-street': {
    id: 'prop-street',
    label: 'Street furniture / lamp / sign',
    trisBand: [2_000, 20_000],
    defaultTargetTris: 8_000,
    textureMax: 2048,
    texturePreferred: 1024,
    materialsGoal: 3,
    triageLightMax: 30_000,
    triageFullMin: 50_000
  }
};

const PROFILE_IDS = Object.keys(PROFILES);

function parseArgs(argv) {
  const out = {
    in: null,
    out: null,
    inDir: null,
    outDir: null,
    profile: null,
    autoProfile: false,
    targetTris: null,
    report: false,
    keepOriginal: true
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--in-dir') out.inDir = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--profile') out.profile = argv[++i];
    else if (a === '--auto-profile') out.autoProfile = true;
    else if (a === '--target-tris') out.targetTris = Number(argv[++i]);
    else if (a === '--report') out.report = true;
    else if (a === '--keep-original') out.keepOriginal = true;
    else if (a === '--no-keep-original') out.keepOriginal = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/optimize-glb.mjs --in path.glb --out path.glb \\
    --profile ${PROFILE_IDS.join('|')} \\
    [--target-tris N] [--report] [--keep-original|--no-keep-original]

Profiles (default target tris / texture preferred):
${PROFILE_IDS.map((id) => {
    const p = PROFILES[id];
    return `  ${id.padEnd(16)} ~${p.defaultTargetTris} tris  (band ${p.trisBand[0]}–${p.trisBand[1]})  tex≤${p.texturePreferred}`;
  }).join('\n')}`);
}

/** Rough auto-profile from filename / size (batch convenience). */
export function suggestProfile(filePath, bytesHint) {
  const name = path.basename(filePath).toLowerCase();
  const bytes = bytesHint ?? (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
  if (/house|casa|apt|apart|building|predio|slab|roof|wall/.test(name)) return 'building';
  if (/sofa|bed|furn|interior|prop|neon|basin|mirror|aircraft|avion/.test(name)) {
    return bytes > 15_000_000 ? 'interior-prop' : 'prop-street';
  }
  if (/truck|bus|jeep|apc|van|loco|train|caminh|util/.test(name)) {
    return bytes > 8_000_000 ? 'vehicle-hero' : 'vehicle-npc';
  }
  if (/police|npc|traffic/.test(name)) return 'vehicle-npc';
  if (/car|vehicle|mustang|bmw|alfa|lambo|gtr|skyline/.test(name)) return 'vehicle-hero';
  if (bytes > 25_000_000) return 'building';
  if (bytes > 4_000_000) return 'vehicle-hero';
  if (bytes > 1_000_000) return 'vehicle-npc';
  return 'prop-street';
}

async function runBatch(args) {
  const inDir = path.resolve(args.inDir);
  const outDir = path.resolve(args.outDir || args.inDir);
  if (!fs.existsSync(inDir)) throw new Error(`--in-dir not found: ${inDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs
    .readdirSync(inDir)
    .filter((f) => /\.glb$/i.test(f) && !/\.original\.glb$/i.test(f) && !/repaired-tmp/i.test(f))
    .sort();
  if (!files.length) {
    console.log(`[batch] no .glb in ${inDir}`);
    return [];
  }
  const results = [];
  for (const file of files) {
    const inPath = path.join(inDir, file);
    const base = path.basename(file, path.extname(file)).replace(/\.optimized$/i, '');
    const outPath = path.join(outDir, `${base}.glb`);
    let profile = args.profile;
    if (!profile && args.autoProfile) profile = suggestProfile(inPath);
    if (!profile) throw new Error('batch needs --profile or --auto-profile');
    console.log(`\n######## BATCH ${file} → ${outPath}  profile=${profile}`);
    try {
      const summary = await optimizeGlb({
        in: inPath,
        out: outPath,
        profile,
        targetTris: args.targetTris,
        report: args.report,
        keepOriginal: args.keepOriginal
      });
      results.push({ file, ok: true, profile, summary });
    } catch (err) {
      console.error(`[batch] FAIL ${file}:`, err.message || err);
      results.push({ file, ok: false, profile, error: String(err?.message || err) });
    }
  }
  console.log(`\n[batch] done ${results.filter((r) => r.ok).length}/${results.length} ok`);
  return results;
}

function countTris(document) {
  let tris = 0;
  let prims = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prims++;
      const idx = prim.getIndices();
      if (idx) tris += idx.getCount() / 3;
      else {
        const pos = prim.getAttribute('POSITION');
        if (pos) tris += pos.getCount() / 3;
      }
    }
  }
  return { tris: Math.round(tris), prims, meshes: document.getRoot().listMeshes().length };
}

function inspectDoc(document, bytes) {
  const root = document.getRoot();
  const { tris, prims, meshes } = countTris(document);
  const materials = root.listMaterials().map((m) => m.getName() || '(unnamed)');
  const textures = root.listTextures().map((t) => {
    const img = t.getImage();
    const size = t.getSize?.() || null;
    return {
      name: t.getName() || '(unnamed)',
      mime: t.getMimeType(),
      kb: img ? +(img.byteLength / 1024).toFixed(1) : 0,
      size
    };
  });
  return {
    tris,
    meshes,
    prims,
    materials: materials.length,
    materialNames: materials,
    textures,
    bytes,
    mb: +(bytes / 1e6).toFixed(2),
    nodes: root.listNodes().length,
    animations: root.listAnimations().length,
    skins: root.listSkins().length,
    cameras: root.listCameras().length
  };
}

function printReport(label, report) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `tris=${report.tris}  meshes=${report.meshes}  prims=${report.prims}  ` +
      `materials=${report.materials}  bytes=${report.bytes} (${report.mb} MB)`
  );
  console.log(`nodes=${report.nodes}  anim=${report.animations}  skins=${report.skins}  cams=${report.cameras}`);
  if (report.materialNames?.length) {
    console.log('materials:', report.materialNames.join(', '));
  }
  if (report.textures?.length) {
    for (const t of report.textures) {
      const dim = t.size ? `${t.size[0]}x${t.size[1]}` : '?';
      console.log(`  tex ${t.name} ${t.mime} ${dim} ${t.kb}KB`);
    }
  }
}

function underPublicModels(filePath) {
  const norm = path.resolve(filePath).replace(/\\/g, '/');
  return /\/public\/models\//.test(norm);
}

function originalSiblingPath(outPath) {
  const dir = path.dirname(outPath);
  const base = path.basename(outPath, path.extname(outPath));
  const stem = base.replace(/\.optimized$/i, '');
  return path.join(dir, `${stem}.original.glb`);
}

async function maybeKeepOriginal(args) {
  if (!args.keepOriginal) return null;
  if (!underPublicModels(args.out)) {
    console.log('[keep-original] skip — --out not under public/models/');
    return null;
  }
  const dest = originalSiblingPath(args.out);
  if (fs.existsSync(dest)) {
    console.log(`[keep-original] already exists, leave untouched: ${dest}`);
    return dest;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(args.in, dest);
  console.log(`[keep-original] wrote ${dest}`);
  return dest;
}

/**
 * Quaternius / Sketchfab packs sometimes list images with mimeType but no
 * bufferView/uri. NodeIO throws "Missing resource URI or buffer view".
 * Strip those images + orphan textures and remap material indices in-place.
 * @param {string} filePath
 * @returns {boolean} true if file was rewritten
 */
function repairEmptyImagesInPlace(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 20 || buf.toString('utf8', 0, 4) !== 'glTF') return false;
  const totalLen = buf.readUInt32LE(8);
  let offset = 12;
  let jsonStart = -1;
  let jsonLen = 0;
  let binStart = -1;
  let binLen = 0;
  while (offset + 8 <= totalLen) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.toString('utf8', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (chunkType === 'JSON') {
      jsonStart = dataStart;
      jsonLen = chunkLen;
    } else if (chunkType.startsWith('BIN')) {
      binStart = dataStart;
      binLen = chunkLen;
    }
    offset = dataStart + chunkLen;
  }
  if (jsonStart < 0) return false;
  const jsonText = buf.toString('utf8', jsonStart, jsonStart + jsonLen).trim();
  let j;
  try {
    j = JSON.parse(jsonText);
  } catch {
    return false;
  }
  const imgs = j.images || [];
  const bad = new Set();
  imgs.forEach((im, i) => {
    if (im.bufferView == null && im.uri == null) bad.add(i);
  });
  if (bad.size === 0) return false;

  const imgMap = new Map();
  const newImgs = [];
  imgs.forEach((im, i) => {
    if (bad.has(i)) return;
    imgMap.set(i, newImgs.length);
    newImgs.push(im);
  });
  j.images = newImgs;

  const texMap = new Map();
  const newTexs = [];
  (j.textures || []).forEach((t, i) => {
    const src = t.source;
    if (src == null || !imgMap.has(src)) return;
    const nt = { ...t, source: imgMap.get(src) };
    texMap.set(i, newTexs.length);
    newTexs.push(nt);
  });
  j.textures = newTexs;

  const remapInfo = (info, owner, key) => {
    if (!info || info.index == null) return;
    if (texMap.has(info.index)) info.index = texMap.get(info.index);
    else delete owner[key];
  };
  for (const mat of j.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    remapInfo(pbr.baseColorTexture, pbr, 'baseColorTexture');
    remapInfo(pbr.metallicRoughnessTexture, pbr, 'metallicRoughnessTexture');
    remapInfo(mat.normalTexture, mat, 'normalTexture');
    remapInfo(mat.occlusionTexture, mat, 'occlusionTexture');
    remapInfo(mat.emissiveTexture, mat, 'emissiveTexture');
  }

  let jsonBytes = Buffer.from(JSON.stringify(j), 'utf8');
  while (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.from(' ')]);
  const binChunk = binStart >= 0 ? buf.subarray(binStart, binStart + binLen) : Buffer.alloc(0);
  let binBytes = Buffer.from(binChunk);
  while (binBytes.length % 4) binBytes = Buffer.concat([binBytes, Buffer.from([0])]);
  const outLen = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const out = Buffer.alloc(outLen);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(outLen, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.write('JSON', 16);
  jsonBytes.copy(out, 20);
  const binHdr = 20 + jsonBytes.length;
  out.writeUInt32LE(binBytes.length, binHdr);
  out.write('BIN\0', binHdr + 4);
  binBytes.copy(out, binHdr + 8);
  fs.writeFileSync(filePath, out);
  console.log(
    `[repair] stripped ${bad.size} empty image(s) in ${filePath} ` +
      `(textures ${ (j.textures || []).length } kept)`
  );
  return true;
}

async function loadSharp() {

  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

/**
 * Shared optimize pipeline. Callable from wrappers (e.g. optimize-car-glb).
 * @param {{ in: string, out: string, profile: string, targetTris?: number|null, report?: boolean, keepOriginal?: boolean }} opts
 */
export async function optimizeGlb(opts) {
  const profileId = opts.profile;
  if (!profileId || !PROFILES[profileId]) {
    throw new Error(
      `invalid or missing --profile (got ${JSON.stringify(profileId)}); use one of: ${PROFILE_IDS.join(', ')}`
    );
  }
  const profile = PROFILES[profileId];
  const targetTris =
    opts.targetTris != null && Number.isFinite(opts.targetTris)
      ? opts.targetTris
      : profile.defaultTargetTris;
  const keepOriginal = opts.keepOriginal !== false;
  const report = !!opts.report;

  if (!opts.in || !opts.out) {
    throw new Error('--in and --out are required');
  }
  if (!fs.existsSync(opts.in)) {
    throw new Error(`input not found: ${opts.in}`);
  }

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  let inPath = opts.in;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const deps = {
    'meshopt.encoder': MeshoptEncoder
  };
  try {
    deps['draco3d.decoder'] = await draco3d.createDecoderModule();
    deps['draco3d.encoder'] = await draco3d.createEncoderModule();
  } catch (err) {
    console.warn('[draco] modules unavailable — Draco GLBs may fail:', err?.message || err);
  }
  io.registerDependencies(deps);

  let document;
  try {
    document = await io.read(inPath);
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/Missing resource URI or buffer view/i.test(msg)) throw err;
    console.warn(`[repair] io.read failed (${msg}) — empty-image strip on temp copy`);
    const tmp = `${inPath}.repaired-tmp.glb`;
    fs.copyFileSync(inPath, tmp);
    if (!repairEmptyImagesInPlace(tmp)) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
    document = await io.read(tmp);
    inPath = tmp;
    opts = { ...opts, in: tmp };
  }
  const beforeBytes = fs.statSync(inPath).size;
  const before = inspectDoc(document, beforeBytes);
  printReport('BEFORE', before);
  console.log(
    `\n[profile] ${profile.id} — ${profile.label}` +
      `  band ${profile.trisBand[0]}–${profile.trisBand[1]}` +
      `  target=${targetTris}  tex≤${profile.texturePreferred} (max ${profile.textureMax})` +
      `  mats goal ≤~${profile.materialsGoal}`
  );

  // 0. Triage
  if (before.tris <= profile.triageLightMax) {
    console.log(
      `\n[triage] ${before.tris} tris ≤~${profile.triageLightMax} → light path ` +
        `(clean + compress; simplify only if above target ${targetTris})`
    );
  } else if (before.tris > profile.triageFullMin || before.materials > 8) {
    console.log(
      `\n[triage] ${before.tris} tris / ${before.materials} mats → full pipeline recommended`
    );
  }

  await maybeKeepOriginal({ ...opts, keepOriginal });

  // 1. Clean
  await document.transform(
    metalRough(),
    weld({}),
    dedup(),
    prune({ keepAttributes: true, keepLeaves: false })
  );

  // 2. Decimate toward target (some Quaternius/loose meshes crash meshopt — skip soft)
  const mid = countTris(document);
  if (mid.tris > targetTris) {
    const ratio = Math.max(0.05, Math.min(1, targetTris / mid.tris));
    console.log(`\n[decimate] ${mid.tris} → target ${targetTris} (ratio=${ratio.toFixed(3)})`);
    try {
      await document.transform(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio,
          error: 0.001
        })
      );
    } catch (err) {
      console.warn(
        `[decimate] simplify failed (${err?.message || err}) — continue without decimate`
      );
    }
  } else {
    console.log(
      `\n[decimate] skip — ${mid.tris} tris already ≤ target ${targetTris} ` +
        `(band ${profile.trisBand[0]}–${profile.trisBand[1]}; raising tris is not automated)`
    );
  }

  // 3. Material cleanup (not full atlas bake)
  let bakeTodo = false;
  try {
    await document.transform(palette({ min: 5 }));
  } catch (err) {
    console.warn('[palette] skipped:', err.message || err);
    bakeTodo = true;
  }
  const afterMats = document.getRoot().listMaterials().length;
  if (afterMats > profile.materialsGoal) {
    bakeTodo = true;
    console.log(
      `\n[TODO Blender] materials still ${afterMats} (>~${profile.materialsGoal} hot). ` +
        `Full albedo-atlas bake (1K–2K) not automated — collapse in Blender if needed.`
    );
  } else {
    console.log(`\n[materials] ${afterMats} after palette/metalRough cleanup`);
  }

  // 4. Textures (profile preferred size, capped at textureMax)
  const texSize = Math.min(profile.texturePreferred, profile.textureMax);
  const sharp = await loadSharp();
  if (sharp) {
    await document.transform(
      textureCompress({
        encoder: sharp,
        resize: [texSize, texSize]
      })
    );
    console.log(`[textures] resized to ≤${texSize} via sharp`);
  } else {
    console.log('[textures] sharp unavailable — skip resize (install sharp for atlas downscale)');
  }

  // 5. Compress
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  await io.write(opts.out, document);
  const afterBytes = fs.statSync(opts.out).size;
  const after = inspectDoc(document, afterBytes);
  printReport('AFTER', after);

  const [bandLo, bandHi] = profile.trisBand;
  const inBand = after.tris >= bandLo && after.tris <= bandHi;
  const underBand = after.tris < bandLo;
  console.log(
    `\nΔ tris ${before.tris} → ${after.tris} (${after.tris - before.tris})` +
      `  |  Δ bytes ${before.bytes} → ${after.bytes} ` +
      `(${(((after.bytes - before.bytes) / before.bytes) * 100).toFixed(1)}%)`
  );
  if (inBand) {
    console.log(`[quality] tris in band ${bandLo}–${bandHi} ✓`);
  } else if (underBand) {
    console.log(
      `[quality] tris ${after.tris} below band ${bandLo}–${bandHi} (OK if silhouette holds; not auto-raised)`
    );
  } else {
    console.log(
      `[quality] tris ${after.tris} still above band ${bandLo}–${bandHi} — consider lower --target-tris or Blender`
    );
  }
  if (bakeTodo) {
    console.log(
      `[TODO] material bake/atlas may still need Blender for quality gate ≤~${profile.materialsGoal} mats.`
    );
  }

  const summary = {
    profile: profile.id,
    targetTris,
    before,
    after,
    bakeTodo,
    inBand,
    underBand
  };

  if (report) {
    const reportPath = opts.out.replace(/\.glb$/i, '') + '.optimize-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    console.log(`[report] ${reportPath}`);
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (args.inDir) {
    if (!args.profile && !args.autoProfile) {
      usage();
      process.exit(1);
    }
    await runBatch(args);
    return;
  }
  if (!args.in || !args.out || (!args.profile && !args.autoProfile)) {
    usage();
    process.exit(1);
  }
  if (!args.profile && args.autoProfile) {
    args.profile = suggestProfile(args.in);
    console.log(`[auto-profile] ${args.profile}`);
  }
  await optimizeGlb(args);
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
