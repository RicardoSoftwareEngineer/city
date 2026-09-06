/**
 * Focus-residency remaining work + optional freeze of the load radius.
 *
 * While the focus grid cell is stable and in-radius remaining hits 0, freeze the
 * effective load radius so a parked car does not keep expanding forever.
 * Moving to a new focus cell clears the freeze.
 */

import { memoryGuardian } from './memoryGuardian.js';

let focusKey = null;
let frozenRadius = null;
/** Ignore total===0 until we have seen real work (avoid boot freeze). */
let armed = false;
let revision = 0;

/** @type {{ total: number, done: number, items: Array<{label: string, count: number}>, optional: Array<{label: string, count: number}>, focusReady: boolean, focusKey: string|null, radius: number, frozen: boolean }} */
let snapshot = {
  total: 0,
  done: 0,
  items: [],
  optional: [],
  focusReady: false,
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
    frozenRadius = null;
    bump();
  }
}

/**
 * Radius streams should fill for the current focus.
 * Frozen after armed + remaining hit 0 while the cell is unchanged.
 */
export function effectiveLoadRadius() {
  if (frozenRadius != null) return frozenRadius;
  return memoryGuardian.radius;
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

  if (armed && total === 0 && frozenRadius == null && focusKey != null) {
    frozenRadius = memoryGuardian.radius;
  }

  const focusReady = armed && total === 0;
  snapshot = {
    total,
    done: remain.done | 0,
    items,
    optional,
    focusReady,
    focusKey,
    radius: frozenRadius != null ? frozenRadius : radius,
    frozen: frozenRadius != null
  };
  bump();
  return snapshot;
}
