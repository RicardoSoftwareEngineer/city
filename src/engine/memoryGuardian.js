/**
 * MemoryGuardian — owns residency radius + budget + eviction.
 *
 * Loader only fills what is inside `radius` around the focus (car).
 * Adapts from real runtime signals (sustained FPS, hitchy instant FPS,
 * JS heap pressure, last draw ms) — not a fake GPU tier. When performance
 * is bad, radius shrinks (hard floor ~10 m) and outsiders are disposed.
 * When healthy, radius grows toward max with hysteresis.
 *
 * Timing is wall-clock based so a 3 FPS soak still ratchets within a few
 * seconds (frame-count hysteresis would stall). Soft-cap never dispose-
 * thrash inside the circle (STATUS_BREAKPOINT lesson from PR #72).
 *
 * Phys pin: `kind === 'phys'` residents within PHYS_PIN_RADIUS of the car are
 * immortal until the car leaves — stronger than soft-cap / radius shrink, so
 * the Heightfield under the wheels never disappears when Guardian tightens.
 */

import { getLastDraw } from './loadLog.js';
import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { noteDecision } from './personaLog.js';

export const MIN_RADIUS = 10;
export const MAX_RADIUS = 600;
/** Immortal phys zone under the car (Chebyshev). Matches ensureGroundAround. */
export const PHYS_PIN_RADIUS = 20;
const STEP = 10;
/** Big step when FPS/draw are critical so idle 3 FPS recovers quickly. */
const STEP_FAST = 40;
/** Heap used/limit — expand only below LOW, shrink above HIGH. */
const HEAP_EXPAND_BELOW = 0.55;
const HEAP_SHRINK_ABOVE = 0.72;
/** Soft cap on registered residents before we treat the "table" as full. */
const RESIDENT_SOFT_CAP = 280;
/** Wall-clock (ms) of sustained bad signals before each shrink step. */
const SHRINK_MS = 1800;
const SHRINK_MS_FULL = 1000;
const SHRINK_MS_CRITICAL = 700;
/** Wall-clock (ms) of healthy signals before each expand step. */
const EXPAND_MS = 3200;
/** Sustained / instant FPS below these → shrink. */
const FPS_SHRINK_EMA = TARGET_FPS - 12; // ~48
const FPS_CRITICAL_EMA = 22;
const FPS_CRITICAL_INSTANT = 15;
/** Draw ms (renderer.render wait on main thread) → shrink. */
const DRAW_SHRINK_MS = 22;
const DRAW_CRITICAL_MS = 40;
const DRAW_EXPAND_BELOW_MS = 14;

function heapPressure() {
  const m = typeof performance !== 'undefined' ? performance.memory : null;
  if (!m?.jsHeapSizeLimit) return 0.5; // unknown — neutral
  return m.usedJSHeapSize / m.jsHeapSizeLimit;
}

function softCapFor(radius) {
  // Scale with radius, but keep a useful floor. Floor 48 at r40 filled the table
  // with terrain alone, flipped full→shrink, and starved the stream.
  return Math.max(120, Math.round(RESIDENT_SOFT_CAP * Math.max(0.35, radius / MAX_RADIUS)));
}

function chebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/** @type {Map<string, { id: string, kind: string, x: number, z: number, dispose: () => void }>} */
const residents = new Map();

let focusX = 0;
let focusZ = 0;
let radius = 120;
let badSince = 0;
let goodSince = 0;
let lastEvictCount = 0;
let lastPressure = 0.5;
let lastTableFull = false;
let lastRadiusNoted = radius;
let lastAdaptReason = 'boot';
let lastDrawMs = 0;
let lastSoftCap = softCapFor(radius);

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
  /** Table / budget full — loader should not prepare more. */
  get isTableFull() {
    return lastPressure >= HEAP_SHRINK_ABOVE || residents.size >= lastSoftCap;
  },
  /**
   * Loader may advance residency. Valve HOLD already gates GPU via throughValve —
   * coupling wantsLoad to holding starved terrain/carpet every hitch.
   */
  get wantsLoad() {
    return !this.isTableFull;
  },

  setFocus(x, z) {
    focusX = x;
    focusZ = z;
  },

  /** True if a world point may stay loaded / be loaded. */
  allowsAt(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= radius + 0.01;
  },

  /** Phys Heightfield under/near the car — never evicted while inside this zone. */
  isPhysPinned(x, z) {
    return chebyshev(x, z, focusX, focusZ) <= PHYS_PIN_RADIUS + 0.01;
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

  /** Drop everyone outside the current radius (farthest first if still over cap). */
  evictOutside() {
    let n = 0;
    const outside = [];
    for (const row of residents.values()) {
      const d = this._residentDist(row);
      // Pin is stronger than radius shrink: phys near the car stays until the car leaves.
      if (row.kind === 'phys' && d <= PHYS_PIN_RADIUS + 0.01) continue;
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
    // Phys pin (above) is stronger still: never thrash-dispose colliders under the car.
    lastEvictCount = n;
    return n;
  },

  /**
   * Call once per frame after focus is set.
   * Adjusts radius with wall-clock hysteresis; returns { radius, evicted, pressure }.
   */
  tick() {
    const now = performance.now();
    lastPressure = heapPressure();
    lastSoftCap = softCapFor(radius);
    const full = residents.size >= lastSoftCap;
    const draw = getLastDraw();
    lastDrawMs = draw?.ms || 0;
    const ema = loadGovernor.fps;
    const inst = loadGovernor.instantFps;

    const fpsBad = ema < FPS_SHRINK_EMA || inst < TARGET_FPS - 20;
    const fpsCritical = ema < FPS_CRITICAL_EMA || inst < FPS_CRITICAL_INSTANT;
    const drawLive = draw?.tag && draw.tag !== 'paused';
    const drawBad = drawLive && lastDrawMs >= DRAW_SHRINK_MS;
    const drawCritical = drawLive && lastDrawMs >= DRAW_CRITICAL_MS;
    const heapBad = lastPressure >= HEAP_SHRINK_ABOVE;

    // Soft-cap full must NOT shrink radius (evict→empty→starve). Full only gates wantsLoad.
    const wantShrink = fpsBad || drawBad || heapBad;
    const wantExpand =
      !wantShrink &&
      lastPressure <= HEAP_EXPAND_BELOW &&
      !full &&
      loadGovernor.isSmooth &&
      (!drawLive || lastDrawMs < DRAW_EXPAND_BELOW_MS);

    if (wantShrink) {
      goodSince = 0;
      if (!badSince) badSince = now;
      const held = now - badSince;
      const streaming = loadGovernor.streaming;
      const need = streaming
        ? SHRINK_MS * 2
        : fpsCritical || drawCritical
          ? SHRINK_MS_CRITICAL
          : heapBad
            ? SHRINK_MS_FULL
            : SHRINK_MS;
      const step = streaming
        ? STEP
        : fpsCritical || drawCritical
          ? STEP_FAST
          : STEP;
      if (held >= need && radius > MIN_RADIUS) {
        radius = Math.max(MIN_RADIUS, radius - step);
        badSince = now;
        lastSoftCap = softCapFor(radius);
        const why = fpsCritical
          ? 'fps!'
          : drawCritical
            ? 'draw!'
            : fpsBad
              ? 'fps'
              : drawBad
                ? 'draw'
                : 'heap';
        lastAdaptReason = `shrink ${why}`;
      } else if (wantShrink) {
        lastAdaptReason = fpsCritical
          ? 'hold fps!'
          : drawCritical
            ? 'hold draw!'
            : fpsBad
              ? 'hold fps'
              : drawBad
                ? 'hold draw'
                : 'hold heap';
      }
    } else if (wantExpand) {
      badSince = 0;
      if (!goodSince) goodSince = now;
      if (now - goodSince >= EXPAND_MS && radius < MAX_RADIUS) {
        radius = Math.min(MAX_RADIUS, radius + STEP);
        goodSince = now;
        lastSoftCap = softCapFor(radius);
        lastAdaptReason = 'expand';
      } else {
        lastAdaptReason = 'hold expand';
      }
    } else {
      badSince = 0;
      goodSince = 0;
      lastAdaptReason = 'steady';
    }

    if (radius < lastRadiusNoted) {
      noteDecision('Guardian', `${lastAdaptReason} →${Math.round(radius)}m`);
      lastRadiusNoted = radius;
    } else if (radius > lastRadiusNoted) {
      noteDecision('Guardian', `expand →${Math.round(radius)}m`);
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
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      pinRadius: PHYS_PIN_RADIUS,
      innerRadius: this.innerRadius,
      focusX,
      focusZ,
      residents: residents.size,
      softCap: lastSoftCap,
      pressure: lastPressure,
      tableFull: this.isTableFull,
      lastEvictCount,
      adaptReason: lastAdaptReason,
      drawMs: lastDrawMs,
      fps: loadGovernor.fps
    };
  }
};
