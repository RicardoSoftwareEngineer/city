/**
 * Focus-residency remaining work (Fila do foco) + two-stage ready UI.
 *
 * Stages (spec 02-loading):
 *   Mínimo jogável — phys + spawn streets + near terrain
 *   Foco completo  — core Fila total === 0 (carpet optional)
 *
 * effectiveLoadRadius === Guardian / preset radius (fixed Ultra/Simples).
 */

import { memoryGuardian } from './memoryGuardian.js';
import { getLoadOrderSnapshot } from './loadOrderLog.js';

let focusKey = null;
/** Ignore remaining until city stream / heavy registration is underway. */
let armed = false;
let revision = 0;
/** Near terrain mesh has made progress (WorldStream.hasNearTerrainProgress). */
let nearTerrainReady = false;

/** @type {{ total: number, done: number, items: Array<{label: string, count: number}>, optional: Array<{label: string, count: number}>, focusReady: boolean, playableMin: boolean, stage: string, focusKey: string|null, radius: number, frozen: boolean }} */
let snapshot = {
  total: 0,
  done: 0,
  items: [],
  optional: [],
  focusReady: false,
  playableMin: false,
  stage: 'idle',
  focusKey: null,
  radius: 0,
  frozen: false
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
    bump();
  }
}

/** Streams fill to the fixed Guardian / preset radius. */
export function effectiveLoadRadius() {
  return memoryGuardian.radius;
}

/** WorldStream reports near-terrain progress for Mínimo jogável. */
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
  return row?.status === 'done';
}

function computeStages(total) {
  const physOk = phaseDone('ground');
  const spawnOk = phaseDone('spawn');
  const playableMin = physOk && spawnOk && nearTerrainReady;
  const focusReady = armed && total === 0;
  let stage = 'loading';
  if (focusReady) stage = 'foco-completo';
  else if (playableMin) stage = 'minimo-jogavel';
  else if (!armed && physOk) stage = 'idle';
  return { playableMin, focusReady, stage };
}

/**
 * @param {{ total: number, done?: number, items: Array<{label: string, count: number}>, optional?: Array<{label: string, count: number}> }} remain
 * `total` / `items` are core focus work only (terrain + streets…nature prio≤4).
 * Carpet and other fundo work go in `optional` and never block focusReady.
 */
export function publishFocusRemain(remain) {
  const radius = effectiveLoadRadius();
  const total = Math.max(0, remain.total | 0);
  const items = (remain.items || []).filter((it) => it.count > 0);
  const optional = (remain.optional || []).filter((it) => it.count > 0);
  const stages = computeStages(total);
  snapshot = {
    total,
    done: remain.done | 0,
    items,
    optional,
    focusReady: stages.focusReady,
    playableMin: stages.playableMin,
    stage: stages.stage,
    focusKey,
    radius,
    frozen: false
  };
  bump();
  return snapshot;
}
