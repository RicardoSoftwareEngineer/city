/**
 * MemoryGuardian — owns residency radius + budget + eviction.
 *
 * Loader only fills what is inside `radius` around the focus (car).
 * When memory pressure is high, radius shrinks and outsiders are disposed.
 * When there is headroom, radius grows (hysteresis) so the circle can expand.
 */

import { loadGovernor } from './LoadGovernor.js';
import { noteDecision } from './personaLog.js';

const MIN_RADIUS = 80;
const MAX_RADIUS = 600;
const STEP = 10;
/** Heap used/limit — expand only below LOW, shrink above HIGH. */
const HEAP_EXPAND_BELOW = 0.55;
const HEAP_SHRINK_ABOVE = 0.72;
/** Soft cap on registered residents before we treat the "table" as full. */
const RESIDENT_SOFT_CAP = 280;
const HYSTERESIS_FRAMES = 45;

function heapPressure() {
  const m = typeof performance !== 'undefined' ? performance.memory : null;
  if (!m?.jsHeapSizeLimit) return 0.5; // unknown — neutral
  return m.usedJSHeapSize / m.jsHeapSizeLimit;
}

function chebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/** @type {Map<string, { id: string, kind: string, x: number, z: number, dispose: () => void }>} */
const residents = new Map();

let focusX = 0;
let focusZ = 0;
let radius = 120;
let expandStreak = 0;
let shrinkStreak = 0;
let lastEvictCount = 0;
let lastPressure = 0.5;
let lastTableFull = false;
let lastRadiusNoted = radius;

export const memoryGuardian = {
  get radius() {
    return radius;
  },
  /** Inner 10% of residency radius — full quality intent. */
  get innerRadius() {
    return radius * 0.1;
  },
  get minRadius() {
    return MIN_RADIUS;
  },
  get maxRadius() {
    return MAX_RADIUS;
  },
  get focus() {
    return { x: focusX, z: focusZ };
  },
  get softCap() {
    return RESIDENT_SOFT_CAP;
  },
  get residentCount() {
    return residents.size;
  },
  get pressure() {
    return lastPressure;
  },
  get lastEvictCount() {
    return lastEvictCount;
  },
  /** Table / budget full — loader should not prepare more. */
  get isTableFull() {
    return lastPressure >= HEAP_SHRINK_ABOVE || residents.size >= RESIDENT_SOFT_CAP;
  },
  /** Loader may advance the ring. */
  get wantsLoad() {
    return !this.isTableFull && !loadGovernor.holding;
  },

  setFocus(x, z) {
    focusX = x;
    focusZ = z;
  },

  /** True if a world point may stay loaded / be loaded. */
  allowsAt(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= radius + 0.01;
  },

  /** Pose inside inner 10% ring (full quality intent). */
  isInnerZone(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= this.innerRadius + 0.01;
  },

  /** Pose between 0.1R and R (low quality intent). */
  isOuterZone(x, z) {
    const d = chebyshev(x, z, focusX, focusZ);
    return d > this.innerRadius + 0.01 && d <= radius + 0.01;
  },

  /**
   * Register a disposable resident. `dispose` must free GPU/CPU and be idempotent.
   * Re-registering the same id replaces the previous entry (after disposing it).
   */
  retain(id, { kind = 'misc', x, z, dispose }) {
    if (!id || typeof dispose !== 'function') return;
    const prev = residents.get(id);
    if (prev) {
      try {
        prev.dispose();
      } catch {
        /* ignore */
      }
    }
    residents.set(id, { id, kind, x, z, dispose });
  },

  release(id) {
    const row = residents.get(id);
    if (!row) return false;
    residents.delete(id);
    try {
      row.dispose();
    } catch {
      /* ignore */
    }
    return true;
  },

  /** Drop everyone outside the current radius (farthest first if still over cap). */
  evictOutside() {
    let n = 0;
    const outside = [];
    for (const row of residents.values()) {
      const d = chebyshev(row.x, row.z, focusX, focusZ);
      if (d > radius + 0.01) outside.push({ row, d });
    }
    outside.sort((a, b) => b.d - a.d);
    for (const { row } of outside) {
      residents.delete(row.id);
      try {
        row.dispose();
        n += 1;
      } catch {
        /* ignore */
      }
    }
    // Soft-cap does NOT dispose inside the circle — that caused load→evict→reload thrash
    // and Chrome STATUS_BREAKPOINT. Over-cap only flips isTableFull / wantsLoad; tick
    // shrinks radius under pressure, then the next evictOutside drops true outsiders.
    lastEvictCount = n;
    return n;
  },

  /**
   * Call once per frame after focus is set.
   * Adjusts radius with hysteresis; returns { radius, evicted, pressure }.
   */
  tick() {
    lastPressure = heapPressure();
    const full = residents.size >= RESIDENT_SOFT_CAP;

    if (lastPressure >= HEAP_SHRINK_ABOVE || full) {
      shrinkStreak += 1;
      expandStreak = 0;
      // Over resident soft-cap: shrink sooner so outsiders become evictable.
      const need = full ? Math.max(8, HYSTERESIS_FRAMES / 3) : HYSTERESIS_FRAMES;
      if (shrinkStreak >= need && radius > MIN_RADIUS) {
        radius = Math.max(MIN_RADIUS, radius - STEP);
        shrinkStreak = 0;
      }
    } else if (lastPressure <= HEAP_EXPAND_BELOW && !full && loadGovernor.isSmooth) {
      expandStreak += 1;
      shrinkStreak = 0;
      if (expandStreak >= HYSTERESIS_FRAMES && radius < MAX_RADIUS) {
        radius = Math.min(MAX_RADIUS, radius + STEP);
        expandStreak = 0;
      }
    } else {
      expandStreak = 0;
      shrinkStreak = 0;
    }

    if (radius < lastRadiusNoted) {
      noteDecision('Guardian', `shrink →${Math.round(radius)}`);
      lastRadiusNoted = radius;
    } else if (radius > lastRadiusNoted) {
      noteDecision('Guardian', `expand →${Math.round(radius)}`);
      lastRadiusNoted = radius;
    }

    const evicted = this.evictOutside();
    if (evicted > 0) noteDecision('Guardian', `evict ${evicted}`);

    const fullNow = this.isTableFull;
    if (fullNow && !lastTableFull) noteDecision('Guardian', 'tableFull');
    lastTableFull = fullNow;

    return { radius, evicted, pressure: lastPressure };
  },

  /** Snapshot for HUD. */
  snapshot() {
    return {
      radius,
      innerRadius: this.innerRadius,
      focusX,
      focusZ,
      residents: residents.size,
      pressure: lastPressure,
      tableFull: this.isTableFull,
      lastEvictCount
    };
  }
};
