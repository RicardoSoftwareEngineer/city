#!/usr/bin/env node
/**
 * optimize-car-glb.mjs — Thin wrapper → optimize-glb.mjs profile `vehicle-hero`.
 *
 * Spec: docs/specs/08-glb-import.md (core) · docs/specs/06-vehicles.md (HUD / A/B)
 *
 *   node scripts/optimize-car-glb.mjs --in path.glb --out path.glb \
 *     [--target-tris 90000] [--report] [--keep-original|--no-keep-original]
 *
 * Equivalent to:
 *   node scripts/optimize-glb.mjs --profile vehicle-hero ...
 */

import { optimizeGlb } from './optimize-glb.mjs';

function parseArgs(argv) {
  const out = {
    in: null,
    out: null,
    targetTris: null,
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
    [--target-tris 90000] [--report] [--keep-original|--no-keep-original]

Thin wrapper for: node scripts/optimize-glb.mjs --profile vehicle-hero ...`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.in || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  await optimizeGlb({
    in: args.in,
    out: args.out,
    profile: 'vehicle-hero',
    targetTris: args.targetTris,
    report: args.report,
    keepOriginal: args.keepOriginal
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
