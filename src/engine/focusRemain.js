/**
 * Focus-residency remaining work (Fila do foco) + two-stage ready UI.
 *
 * Stages (spec 02-loading):
 *   Minimo jogavel — phys + spawn streets + near terrain
 *   Foco completo  — playCore disk (load tile) core Fila total === 0 (carpet optional)
 *
 * effectiveLoadRadius === playCoreRadius until the current focus cell is
 * Foco completo, then full Guardian / preset radius (outer rings unlock).
 * Focus cell change re-locks outer until the new cell playCore is done.
 */

import { memoryGuardian } from "./memoryGuardian.js";
import { getLoadOrderSnapshot } from "./loadOrderLog.js";
import { getActivePreset } from "./qualityPresets.js";

let focusKey = null;
/** Ignore remaining until city stream / heavy registration is underway. */
let armed = false;
let revision = 0;
/** Near terrain mesh has made progress (WorldStream.hasNearTerrainProgress). */
let nearTerrainReady = false;
/**
 * Once playCore Fila hits 0 for this focus cell, unlock outer rings up to preset R.
 * Reset when the focusGrid cell key changes.
 */
let outerUnlocked = false;

/** @type {{ total: number, done: number, items: Array<{label: string, count: number}>, optional: Array<{label: string, count: number}>, focusReady: boolean, playableMin: boolean, stage: string, focusKey: string|null, radius: number, playCoreRadius: number, frozen: boolean, outerUnlocked: boolean }} */
let snapshot = {
  total: 0,
  done: 0,
  items: [],
  optional: [],
  focusReady: false,
  playableMin: false,
  stage: "idle",
  focusKey: null,
  radius: 0,
  playCoreRadius: 0,
  frozen: false,
  outerUnlocked: false
};

function bump() {
  revision += 1;
}

export function getFocusRemainRevision() {
  return revision;
}

export function getFocusRemainSnapshot() {
  return snapshot;
}

/** Always false — fixed preset radius needs no park freeze. */
export function isLoadRadiusFrozen() {
  return false;
}

/** Call when city stream / heavy registration is underway. */
export function armFocusRemain() {
  if (!armed) {
    armed = true;
    bump();
  }
}

export function setFocusCellKey(key) {
  if (key == null) return;
  if (key !== focusKey) {
    focusKey = key;
    // New load tile — prefer predicted warm of next cell; re-gate outer rings.
    outerUnlocked = false;
    bump();
  }
}

/** Preset near disk for the load tile (Foco completo bar). */
export function playCoreRadius() {
  const p = getActivePreset();
  return p.playCoreRadius ?? Math.min(160, p.radius);
}

/**
 * Streams fill playCore first; after Foco completo on the cell, expand to preset R.
 * Never dumps the full Ultra ring into one frame when crossing focusGrid cells.
 */
export function effectiveLoadRadius() {
  const full = memoryGuardian.radius;
  const core = playCoreRadius();
  if (!armed) return Math.min(core, full);
  if (outerUnlocked) return full;
  return Math.min(core, full);
}

export function isOuterUnlocked() {
  return outerUnlocked;
}

/** WorldStream reports near-terrain progress for Minimo jogavel. */
export function setNearTerrainReady(ready) {
  const next = !!ready;
  if (next !== nearTerrainReady) {
    nearTerrainReady = next;
    bump();
    // Recompute stage labels without requiring a remain publish.
    snapshot = { ...snapshot, ...computeStages(snapshot.total) };
  }
}

function phaseDone(id) {
  const snap = getLoadOrderSnapshot();
  const list = [...(snap.sync || []), ...(snap.async || [])];
  const row = list.find((p) => p.id === id);
  return row?.status === "done";
}

function computeStages(total) {
  const physOk = phaseDone("ground");
  const spawnOk = phaseDone("spawn");
  const playableMin = physOk && spawnOk && nearTerrainReady;
  const focusReady = armed && total === 0;
  let stage = "loading";
  if (focusReady) stage = "foco-completo";
  else if (playableMin) stage = "minimo-jogavel";
  else if (!armed && physOk) stage = "idle";
  return { playableMin, focusReady, stage };
}

/**
 * @param {{ total: number, done?: number, items: Array<{label: string, count: number}>, optional?: Array<{label: string, count: number}> }} remain
 * `total` / `items` are core focus work only (terrain + streets…nature prio<=4)
 * inside the **playCore** disk. Carpet and outer-ring work go in `optional`.
 */
export function publishFocusRemain(remain) {
  const coreR = playCoreRadius();
  const loadR = effectiveLoadRadius();
  const total = Math.max(0, remain.total | 0);
  const items = (remain.items || []).filter((it) => it.count > 0);
  const optional = (remain.optional || []).filter((it) => it.count > 0);
  const stages = computeStages(total);
  if (stages.focusReady && !outerUnlocked) {
    outerUnlocked = true;
  }
  snapshot = {
    total,
    done: remain.done | 0,
    items,
    optional,
    focusReady: stages.focusReady,
    playableMin: stages.playableMin,
    stage: stages.stage,
    focusKey,
    radius: loadR,
    playCoreRadius: coreR,
    frozen: false,
    outerUnlocked
  };
  bump();
  return snapshot;
}
