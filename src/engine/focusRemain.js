/**
 * Focus-residency remaining work (Fila do foco).
 *
 * With fixed preset radius there is no Guardian FPS thrash, so park-freeze /
 * residencyFloor are unnecessary. effectiveLoadRadius === Guardian radius.
 * Numbered remaining list + focusReady stay for diagnostics / phase end.
 */

import { memoryGuardian } from './memoryGuardian.js';

let focusKey = null;
/** Ignore remaining until city stream / heavy registration is underway. */
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
  const focusReady = armed && total === 0;
  snapshot = {
    total,
    done: remain.done | 0,
    items,
    optional,
    focusReady,
    focusKey,
    radius,
    frozen: false
  };
  bump();
  return snapshot;
}
