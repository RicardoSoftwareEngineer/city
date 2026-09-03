/**
 * Per-stream-ring load profiler for the "Carregamento do anel" HUD.
 * One entry per Chebyshev radius; items accumulate if the same ring is pumped twice.
 */

function shortName(label) {
  if (!label) return '?';
  const s = String(label);
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return slash >= 0 ? s.slice(slash + 1) : s;
}

/** @type {Map<number, { radius: number, totalMs: number, items: { name: string, ms: number }[] }>} */
const rings = new Map();
let currentRadius = null;
let ringWallStart = 0;
let firstLoadAt = 0;
let revision = 0;

export function getRingLoadRevision() {
  return revision;
}

export function beginRing(radius) {
  currentRadius = radius;
  if (!rings.has(radius)) {
    rings.set(radius, { radius, totalMs: 0, items: [] });
  }
  if (!firstLoadAt) firstLoadAt = performance.now();
  ringWallStart = performance.now();
  revision++;
}

export function recordRingItem(name, ms) {
  if (currentRadius == null) return;
  const row = rings.get(currentRadius);
  if (!row) return;
  const t = Math.round(ms * 10) / 10;
  if (t < 0) return;
  row.items.push({ name: shortName(name), ms: t });
  revision++;
}

/** Wall-clock for the just-finished pumpTo slice (may be called multiple times per radius). */
export function endRing(radius = currentRadius) {
  if (radius == null || !rings.has(radius)) return;
  const row = rings.get(radius);
  row.totalMs += performance.now() - ringWallStart;
  currentRadius = null;
  revision++;
}

/**
 * @returns {{
 *   rings: Array<{
 *     radius: number,
 *     totalMs: number,
 *     itemCount: number,
 *     avgMs: number,
 *     top10: { name: string, ms: number }[]
 *   }>,
 *   totals: { ringCount: number, itemCount: number, elapsedMs: number }
 * }}
 */
export function getRingLoadSnapshot() {
  const list = [...rings.values()]
    .sort((a, b) => a.radius - b.radius)
    .map((row) => {
      const itemCount = row.items.length;
      const sumItems = row.items.reduce((s, it) => s + it.ms, 0);
      const top10 = row.items
        .slice()
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 10);
      return {
        radius: row.radius,
        totalMs: Math.round(row.totalMs),
        itemCount,
        avgMs: itemCount ? Math.round((sumItems / itemCount) * 10) / 10 : 0,
        top10
      };
    });

  const itemCount = list.reduce((s, r) => s + r.itemCount, 0);
  const elapsedMs = firstLoadAt
    ? Math.round(performance.now() - firstLoadAt)
    : 0;

  return {
    rings: list,
    totals: {
      ringCount: list.length,
      itemCount,
      elapsedMs
    }
  };
}

/** Time an async piece of ring work and record it. */
export async function measureRingItem(name, fn) {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    recordRingItem(name, performance.now() - t0);
  }
}

export function measureRingItemSync(name, fn) {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    recordRingItem(name, performance.now() - t0);
  }
}
