#!/usr/bin/env node
/**
 * optimize-car-glb.mjs — Official hero-car GLB optimization (v1, no Blender required).
 *
 * Spec: docs/specs/06-vehicles.md
 *
 *   node scripts/optimize-car-glb.mjs --in path.glb --out path.glb \
 *     [--target-tris 90000] [--report] [--keep-original|--no-keep-original]
 *
 * Automates:
 *   - inspect (tris / meshes / materials / bytes)
 *   - weld, dedup, prune
 *   - simplify toward --target-tris (skipped when already ≤ target)
 *   - metalRough + palette cleanup when helpful (prints TODO if bake incomplete)
 *   - texture resize ≤2K via sharp (when available)
 *   - meshopt compress on write
 *
 * Full albedo-atlas bake (collapse to 1–3 materials with shared UV atlas) may
 * still need Blender when materials/UVs are complex — this script never fails
 * for missing Blender.
 *
 * --keep-original (default true): if --out is under public/models/…, copy the
 * input to <name>.original.glb once (never overwrite an existing original).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  textureCompress,
  getSceneVertexCount,
  VertexCountMethod
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

function parseArgs(argv) {
  const out = {
    in: null,
    out: null,
    targetTris: 90000,
    report: false,
    keepOriginal: true
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
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
  node scripts/optimize-car-glb.mjs --in path.glb --out path.glb \\
    [--target-tris 90000] [--report] [--keep-original|--no-keep-original]`);
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
  // mercedes.glb → mercedes.original.glb (strip trailing .optimized if present)
  const stem = base.replace(/\.optimized$/i, '');
  return path.join(dir, `${stem}.original.glb`);
}

async function maybeKeepOriginal(args) {
  if (!args.keepOriginal) return null;
  if (!underPublicModels(args.out) && !underPublicModels(args.in)) {
    console.log('[keep-original] skip — paths not under public/models/');
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

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.in || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  if (!fs.existsSync(args.in)) {
    console.error(`input not found: ${args.in}`);
    process.exit(1);
  }

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const beforeBytes = fs.statSync(args.in).size;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  // meshopt encoder for write
  io.registerDependencies({
    'meshopt.encoder': MeshoptEncoder
  });

  const document = await io.read(args.in);
  const before = inspectDoc(document, beforeBytes);
  printReport('BEFORE', before);

  // Triage note
  if (before.tris <= 150_000) {
    console.log(
      `\n[triage] ${before.tris} tris ≤~150k → light path (clean + compress; ` +
        `simplify only if above --target-tris ${args.targetTris})`
    );
  } else if (before.tris > 200_000 || before.materials > 8) {
    console.log(
      `\n[triage] ${before.tris} tris / ${before.materials} mats → full pipeline recommended`
    );
  }

  await maybeKeepOriginal(args);

  // 1. Clean
  await document.transform(
    metalRough(),
    weld({}),
    dedup(),
    prune({ keepAttributes: true, keepLeaves: false })
  );

  // 2. Decimate toward target (silhouette-preserving meshopt simplifier)
  const mid = countTris(document);
  if (mid.tris > args.targetTris) {
    const ratio = Math.max(0.05, Math.min(1, args.targetTris / mid.tris));
    console.log(`\n[decimate] ${mid.tris} → target ${args.targetTris} (ratio=${ratio.toFixed(3)})`);
    await document.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio,
        error: 0.001
      })
    );
  } else {
    console.log(
      `\n[decimate] skip — ${mid.tris} tris already ≤ target ${args.targetTris} ` +
        `(hero band 50k–120k; raising tris is not automated)`
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
  if (afterMats > 3) {
    bakeTodo = true;
    console.log(
      `\n[TODO Blender] materials still ${afterMats} (>~3 hot). ` +
        `Full albedo-atlas bake (1K–2K) not automated in v1 — collapse in Blender if needed.`
    );
  } else {
    console.log(`\n[materials] ${afterMats} after palette/metalRough cleanup`);
  }

  // 4. Textures modest (≤2K)
  const sharp = await loadSharp();
  if (sharp) {
    await document.transform(
      textureCompress({
        encoder: sharp,
        resize: [2048, 2048]
      })
    );
    console.log('[textures] resized to ≤2048 via sharp');
  } else {
    console.log('[textures] sharp unavailable — skip resize (install sharp for atlas downscale)');
  }

  // meshopt compress
  await document.transform(
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  await io.write(args.out, document);
  const afterBytes = fs.statSync(args.out).size;
  const after = inspectDoc(document, afterBytes);
  printReport('AFTER', after);

  console.log(
    `\nΔ tris ${before.tris} → ${after.tris} (${after.tris - before.tris})` +
      `  |  Δ bytes ${before.bytes} → ${after.bytes} ` +
      `(${(((after.bytes - before.bytes) / before.bytes) * 100).toFixed(1)}%)`
  );
  if (bakeTodo) {
    console.log('[TODO] material bake/atlas may still need Blender for quality gate ≤~3 mats.');
  }
  if (args.report) {
    const reportPath = args.out.replace(/\.glb$/i, '') + '.optimize-report.json';
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ before, after, targetTris: args.targetTris, bakeTodo }, null, 2)
    );
    console.log(`[report] ${reportPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
