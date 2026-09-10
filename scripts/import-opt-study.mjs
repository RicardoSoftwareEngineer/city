#!/usr/bin/env node
/**
 * Import / optimize the full Quaternius opt-study inventory into public/models/opt-study/<id>/.
 * Reads inventory JSON (default /workspace/uploads/opt-study-full/inventory.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { optimizeGlb } from './optimize-glb.mjs';

const ROOT = path.resolve(process.cwd());
const DEFAULT_INV = '/workspace/uploads/opt-study-full/inventory.json';
const SRC_ROOT = '/workspace/uploads/opt-study-full';
const OUT_ROOT = path.join(ROOT, 'public/models/opt-study');
const GH_HARD = 100 * 1024 * 1024; // GitHub hard limit

function parseArgs(argv) {
  const out = { inventory: DEFAULT_INV, only: null, force: false, skipDone: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--inventory') out.inventory = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--force') out.force = true;
    else if (a === '--help') out.help = true;
    else throw new Error(`unknown arg ${a}`);
  }
  return out;
}

async function importOne(item) {
  const src = path.join(SRC_ROOT, item.src);
  const destDir = path.join(OUT_ROOT, item.id);
  const outGlb = path.join(destDir, 'model.glb');
  const origGlb = path.join(destDir, 'model.original.glb');
  const previewSrc = path.join(SRC_ROOT, 'previews', `${item.id}.jpg`);
  const previewDst = path.join(destDir, 'preview.jpg');

  if (!fs.existsSync(src)) {
    return { id: item.id, ok: false, error: `missing source ${src}`, todo: true };
  }

  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(previewSrc) && !fs.existsSync(previewDst)) {
    fs.copyFileSync(previewSrc, previewDst);
  }

  const already =
    fs.existsSync(outGlb) && fs.existsSync(origGlb) && fs.statSync(outGlb).size > 1000;
  if (already && !item.force && !process.env.FORCE) {
    // Still copy preview if missing
    const reportPath = path.join(destDir, 'model.optimize-report.json');
    let before = null, after = null;
    if (fs.existsSync(reportPath)) {
      try {
        const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        before = { tris: r.before?.tris, mb: r.before?.mb };
        after = { tris: r.after?.tris, mb: r.after?.mb };
      } catch { /* ignore */ }
    }
    return { id: item.id, ok: true, skipped: true, before, after, profile: item.profile };
  }

  console.log(`\n==== import ${item.id}  profile=${item.profile}  label=${item.label}`);
  const summary = await optimizeGlb({
    in: src,
    out: outGlb,
    profile: item.profile,
    report: true,
    keepOriginal: true
  });

  // GitHub 100MB: never commit originals/optimized over hard limit
  const skipped = [];
  for (const f of [origGlb, outGlb]) {
    if (fs.existsSync(f) && fs.statSync(f).size >= GH_HARD) {
      skipped.push(path.basename(f));
      console.warn(`[github-limit] ${f} >= 100MB — removing from tree (will not commit)`);
      fs.unlinkSync(f);
    }
  }

  return {
    id: item.id,
    ok: skipped.length === 0 || fs.existsSync(outGlb),
    skippedFiles: skipped,
    before: { tris: summary.before.tris, mb: summary.before.mb },
    after: { tris: summary.after.tris, mb: summary.after.mb },
    profile: item.profile
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('node scripts/import-opt-study.mjs [--inventory path] [--only id] [--force]');
    process.exit(0);
  }
  const items = JSON.parse(fs.readFileSync(args.inventory, 'utf8'));
  const list = args.only ? items.filter((x) => x.id === args.only) : items;
  const results = [];
  for (const item of list) {
    if (args.force) item.force = true;
    try {
      results.push(await importOne(item));
    } catch (err) {
      console.error(`[import] FAIL ${item.id}`, err);
      results.push({ id: item.id, ok: false, error: String(err?.message || err) });
    }
  }
  const outReport = path.join(SRC_ROOT, 'import-results.json');
  fs.writeFileSync(outReport, JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n[import] ${ok}/${results.length} ok → ${outReport}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
