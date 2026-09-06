/**
 * MemoryGuardian — owns residency radius + budget + eviction.
 *
 * Radius is FIXED from the active quality preset (Ultra / Simples).
 * No live shrink/expand from FPS / draw ms. Terrain meshes may still fill
 * to TERRAIN_VISTA_RADIUS (fence) while heap allows. Soft-cap / heap gates
 * stay simple and may be preset-fixed.
 *
 * Phys pin: `kind === 'phys'` residents within PHYS_PIN_RADIUS of the **real car**
 * (`setCarPosition`) are immortal — stream/Guardian focus may be predicted ahead.
 */

import { getLastDraw } from './loadLog.js';
import { loadGovernor } from './LoadGovernor.js';
import { noteDecision } from './personaLog.js';
import { getActivePreset, onPresetChange } from './qualityPresets.js';
import { GROUND_BODY_HALF } from '../world/RoadDimensions.js';

export const MIN_RADIUS = 10;
/** Absolute ceiling — Ultra uses this; Simples uses a smaller fixed value. */
export const MAX_RADIUS = 900;
/**
 * Low-cost countryside mesh may fill out to the √10 fence (heap-gated via
 * wantsTerrainLoad). Larger than MAX_RADIUS on purpose — fly-cam must see
 * continuous ground, not a blue void island at ~200 m.
 */
export const TERRAIN_VISTA_RADIUS = GROUND_BODY_HALF;
/** Immortal phys zone under the car (Chebyshev). Matches ensureGroundAround. */
export const PHYS_PIN_RADIUS = 20;
/** Heap used/limit — block terrain/nature above. */
const HEAP_SHRINK_ABOVE = 0.72;

function heapPressure() {
  const m = typeof performance !== 'undefined' ? performance.memory : null;
  if (!m?.jsHeapSizeLimit) return 0.5; // unknown — neutral
  return m.usedJSHeapSize / m.jsHeapSizeLimit;
}

function chebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

function presetRadius() {
  return getActivePreset().radius;
}

function presetSoftCap() {
  return getActivePreset().softCap;
}

/** @type {Map<string, { id: string, kind: string, x: number, z: number, dispose: () => void }>} */
const residents = new Map();

let focusX = 0;
let focusZ = 0;
/** Real car pose — phys pin uses this, not predicted focus. */
let carX = 0;
let carZ = 0;
let radius = presetRadius();
let lastEvictCount = 0;
let lastPressure = 0.5;
let lastTableFull = false;
let lastRadiusNoted = radius;
let lastAdaptReason = 'boot';
let lastDrawMs = 0;
let lastSoftCap = presetSoftCap();
/** Legacy park-freeze floor — unused with fixed preset radius (API kept). */
let residencyFloor = null;

function applyPresetRadius(why) {
  const next = presetRadius();
  lastSoftCap = presetSoftCap();
  if (next === radius) {
    lastAdaptReason = `steady ${getActivePreset().label}`;
    return;
  }
  radius = next;
  lastAdaptReason = why || `preset ${getActivePreset().label}`;
  if (radius !== lastRadiusNoted) {
    noteDecision('Guardian', `${lastAdaptReason} →${Math.round(radius)}m`);
    lastRadiusNoted = radius;
  }
}

onPresetChange(() => {
  applyPresetRadius(`preset ${getActivePreset().label}`);
});

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
  get pinRadius() {
    return PHYS_PIN_RADIUS;
  },
  /** Unused with fixed radius — kept for HUD/API compat. */
  get residencyFloor() {
    return residencyFloor;
  },
  /**
   * @param {number|null} r
   */
  setResidencyFloor(r) {
    residencyFloor = r == null || !Number.isFinite(r) ? null : Math.max(0, r);
  },
  get focus() {
    return { x: focusX, z: focusZ };
  },
  get softCap() {
    return lastSoftCap;
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
  get adaptReason() {
    return lastAdaptReason;
  },
  /** Non-terrain residents (streets/veg/buildings) — vista tiles have their own heap gate. */
  _softCapCount() {
    let n = 0;
    for (const row of residents.values()) {
      if (row.kind === 'terrain' || row.kind === 'phys') continue;
      n += 1;
    }
    return n;
  },

  /** Table / budget full — loader should not prepare more (streets/buildings). */
  get isTableFull() {
    return lastPressure >= HEAP_SHRINK_ABOVE || this._softCapCount() >= lastSoftCap;
  },
  /**
   * Loader may advance residency. No Valve HOLD coupling.
   */
  get wantsLoad() {
    return !this.isTableFull;
  },

  /**
   * Terrain mesh pump may advance even when the resident soft-cap is full.
   * Only real heap pressure blocks terrain.
   */
  get wantsTerrainLoad() {
    return heapPressure() < HEAP_SHRINK_ABOVE;
  },

  /**
   * Base vegetation (prio 4) — heap-only gate (same lesson as terrain).
   */
  get wantsNatureLoad() {
    return heapPressure() < HEAP_SHRINK_ABOVE;
  },

  setFocus(x, z) {
    focusX = x;
    focusZ = z;
  },

  /** Real chassis position — phys pin / ensureGroundAround follow the car, not stream focus. */
  setCarPosition(x, z) {
    carX = x;
    carZ = z;
  },

  get car() {
    return { x: carX, z: carZ };
  },

  /** Effective residency disk for streets / veg / buildings (fixed preset R). */
  _worldKeepRadius() {
    return residencyFloor != null ? Math.max(radius, residencyFloor) : radius;
  },

  /** True if a world point may stay loaded / be loaded (streets / veg / buildings). */
  allowsAt(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= this._worldKeepRadius() + 0.01;
  },

  /**
   * Terrain mesh residency — whole √10 countryside to the fence, independent
   * of preset R and of focus drift. Heap still gates via wantsTerrainLoad.
   */
  allowsTerrainAt(x, z) {
    return Math.max(Math.abs(x), Math.abs(z)) <= TERRAIN_VISTA_RADIUS + 320;
  },

  get vistaRadius() {
    return TERRAIN_VISTA_RADIUS;
  },

  /** Phys Heightfield under/near the car — never evicted while inside this zone. */
  isPhysPinned(x, z) {
    return chebyshev(x, z, carX, carZ) <= PHYS_PIN_RADIUS + 0.01;
  },

  /** Pose inside inner 10% ring (full quality intent). */
  isInnerZone(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= this.innerRadius + 0.01;
  },

  /** Pose between 0.1R and keep-R (low quality intent). */
  isOuterZone(x, z) {
    const d = chebyshev(x, z, focusX, focusZ);
    return d > this.innerRadius + 0.01 && d <= this._worldKeepRadius() + 0.01;
  },

  /**
   * Register a disposable resident. `dispose` must free GPU/CPU and be idempotent.
   * Re-registering the same id replaces the previous entry (after disposing it).
   */
  retain(id, { kind = 'misc', x = 0, z = 0, poses = null, dispose }) {
    if (!id || typeof dispose !== 'function') return;
    const prev = residents.get(id);
    if (prev) {
      try {
        prev.dispose();
      } catch {
        /* ignore */
      }
    }
    residents.set(id, {
      id,
      kind,
      x,
      z,
      poses: Array.isArray(poses) && poses.length ? poses : null,
      dispose
    });
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

  /** Distance for residency: nearest pose if present, else anchor (x,z). */
  _residentDist(row) {
    if (row.poses?.length) {
      let min = Infinity;
      for (const p of row.poses) {
        const d = chebyshev(p.x, p.z, focusX, focusZ);
        if (d < min) min = d;
      }
      return min;
    }
    return chebyshev(row.x, row.z, focusX, focusZ);
  },

  /** Drop everyone outside the current fixed radius (farthest first). */
  evictOutside() {
    let n = 0;
    const outside = [];
    for (const row of residents.values()) {
      const d = this._residentDist(row);
      if (row.kind === 'phys') {
        const dCar = chebyshev(row.x, row.z, carX, carZ);
        if (dCar <= PHYS_PIN_RADIUS + 0.01) continue;
      }
      if (row.kind === 'terrain') {
        const dOrigin = Math.max(Math.abs(row.x), Math.abs(row.z));
        if (dOrigin > TERRAIN_VISTA_RADIUS + 320) outside.push({ row, d: dOrigin });
        continue;
      }
      const keepR =
        row.kind === 'world' || row.kind === 'building'
          ? this._worldKeepRadius()
          : radius;
      if (d > keepR + 0.01) outside.push({ row, d });
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
    lastEvictCount = n;
    return n;
  },

  /**
   * Call once per frame after focus is set.
   * Keeps radius locked to the active preset; heap/soft-cap + eviction only.
   */
  tick() {
    applyPresetRadius(null);
    lastPressure = heapPressure();
    lastSoftCap = presetSoftCap();
    const draw = getLastDraw();
    lastDrawMs = draw?.ms || 0;

    if (lastPressure >= HEAP_SHRINK_ABOVE) {
      lastAdaptReason = 'hold heap';
    } else if (this._softCapCount() >= lastSoftCap) {
      lastAdaptReason = 'table full';
    } else {
      lastAdaptReason = `steady ${getActivePreset().label}`;
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
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      vistaRadius: TERRAIN_VISTA_RADIUS,
      pinRadius: PHYS_PIN_RADIUS,
      residencyFloor,
      worldKeepRadius: this._worldKeepRadius(),
      innerRadius: this.innerRadius,
      focusX,
      focusZ,
      carX,
      carZ,
      residents: residents.size,
      softCapCount: this._softCapCount(),
      softCap: lastSoftCap,
      pressure: lastPressure,
      tableFull: this.isTableFull,
      lastEvictCount,
      adaptReason: lastAdaptReason,
      drawMs: lastDrawMs,
      fps: loadGovernor.fps,
      preset: getActivePreset().label
    };
  }
};
