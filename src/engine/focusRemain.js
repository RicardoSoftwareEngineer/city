/**
 * Focus-residency remaining work + early freeze of the load radius.
 *
 * While the focus grid cell is unchanged, freeze effectiveLoadRadius after a
 * short park-stable window (or immediately when in-radius remaining hits 0).
 * Do NOT wait for remaining===0 before freezing — Guardian R still oscillates
 * with FPS and would thrash Fila do foco (15↔329) via dispose→reload.
 *
 * Freeze value = max Guardian radius reached for this cell. Clear only on
 * focus cell change. MemoryGuardian residency floor matches the freeze so
 * world/building growers inside the frozen disk are never thrash-disposed.
 */

import { memoryGuardian } from './memoryGuardian.js';
import { noteDecision } from './personaLog.js';

/** Wall-clock of unchanged focus cell before park-freeze (ms). */
const PARK_STABLE_MS = 1500;

let focusKey = null;
let frozenRadius = null;
/** Ignore freeze until city stream / heavy registration is underway. */
let armed = false;
let revision = 0;
/** performance.now() when current focus cell became active (or when armed). */
let cellStableSince = null;
/** Max memoryGuardian.radius seen for the current cell while unfrozen. */
let cellMaxRadius = 0;

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

function applyResidencyFloor(r) {
  memoryGuardian.setResidencyFloor(r);
}

function clearFreeze() {
  if (frozenRadius != null) {
    frozenRadius = null;
    applyResidencyFloor(null);
  }
}

/**
 * Lock effective load radius at the max R seen for this cell.
 * @param {string} why
 */
function freezeAtCellMax(why) {
  if (frozenRadius != null || !armed || focusKey == null) return;
  const gR = memoryGuardian.radius;
  const lock = Math.max(cellMaxRadius || 0, gR);
  frozenRadius = lock;
  cellMaxRadius = lock;
  applyResidencyFloor(lock);
  noteDecision('Foco', `raio fixo ${Math.round(lock)}m (${why})`);
  bump();
}

function trackCellMaxRadius() {
  const gR = memoryGuardian.radius;
  if (gR > cellMaxRadius) cellMaxRadius = gR;
}

/**
 * After the focus cell is unchanged for PARK_STABLE_MS, freeze at cell max R.
 * Called every frame via setFocusCellKey while the key is stable.
 */
function tickParkFreeze() {
  if (frozenRadius != null || !armed || focusKey == null) return;
  trackCellMaxRadius();
  if (cellStableSince == null) cellStableSince = performance.now();
  if (performance.now() - cellStableSince >= PARK_STABLE_MS) {
    freezeAtCellMax('park');
  }
}

export function getFocusRemainRevision() {
  return revision;
}

export function getFocusRemainSnapshot() {
  return snapshot;
}

export function isLoadRadiusFrozen() {
  return frozenRadius != null;
}

/** Call when city stream / heavy registration is underway. */
export function armFocusRemain() {
  if (!armed) {
    armed = true;
    // Start park clock from arm — idle boot may have sat on one cell for minutes.
    cellStableSince = performance.now();
    cellMaxRadius = memoryGuardian.radius;
    bump();
  }
}

export function setFocusCellKey(key) {
  if (key == null) return;
  if (key !== focusKey) {
    focusKey = key;
    clearFreeze();
    cellStableSince = performance.now();
    cellMaxRadius = memoryGuardian.radius;
    bump();
    return;
  }
  tickParkFreeze();
}

/**
 * Radius streams should fill for the current focus.
 * Frozen after park-stable window (or remaining===0) while the cell is unchanged.
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
  trackCellMaxRadius();
  const radius = effectiveLoadRadius();
  const total = Math.max(0, remain.total | 0);
  const items = (remain.items || []).filter((it) => it.count > 0);
  const optional = (remain.optional || []).filter((it) => it.count > 0);

  // Immediate freeze once the frozen disk is drained (may beat the park timer).
  if (armed && total === 0 && frozenRadius == null && focusKey != null) {
    freezeAtCellMax('remain0');
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
