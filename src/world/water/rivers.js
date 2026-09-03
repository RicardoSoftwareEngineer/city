/**
 * Twin parallel S-shaped rivers east of the city for Water.js vs Water2.js compare.
 * Layout + helpers only — water meshes live in waterRiver / water2River.
 */

export const SPINE = [
  { x: 248, z: -170 },
  { x: 268, z: -90 },
  { x: 312, z: -10 },
  { x: 318, z: 70 },
  { x: 286, z: 150 },
  { x: 252, z: 230 },
  { x: 268, z: 320 }
];

export const RIVER_PAIR_GAP = 28;
export const RIVER_HALF_WIDTH = 7.5;
export const RIVER_BLEND = 4;
export const RIVER_DEPTH = 2.2;
export const RIVER_SAMPLES = 96;
export const RIVER_CROSS = 8;

export const RIVER_WATER = {
  id: 'river-water',
  kind: 'water',
  label: 'Water.js',
  offsetX: 0,
  halfWidth: RIVER_HALF_WIDTH,
  depth: RIVER_DEPTH
};

export const RIVER_WATER2 = {
  id: 'river-water2',
  kind: 'water2',
  label: 'Water2.js',
  offsetX: RIVER_PAIR_GAP,
  halfWidth: RIVER_HALF_WIDTH,
  depth: RIVER_DEPTH
};

export const RIVERS = [RIVER_WATER, RIVER_WATER2];

export const RIVER_MOUNTAINS = [
  { id: 'mt-west', cx: 232, cz: 20, radius: 58, height: 26 },
  { id: 'mt-east', cx: 348, cz: 180, radius: 62, height: 30 }
];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleSpline(controls, samplesPerSeg) {
  const pts = [];
  const n = controls.length;
  if (n < 2) return pts;
  for (let i = 0; i < n - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      pts.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t)
      });
    }
  }
  pts.push(controls[n - 1]);
  return pts;
}

/** Offset spine control points by river.offsetX along +X (parallel twin). */
function riverControls(river) {
  const ox = river.offsetX || 0;
  return SPINE.map((p) => ({ x: p.x + ox, z: p.z }));
}

const polylineCache = new Map();

/** Sampled Catmull-Rom polyline for a river (cached). */
export function riverPolyline(river) {
  let pts = polylineCache.get(river.id);
  if (!pts) {
    const segs = SPINE.length - 1;
    const perSeg = Math.max(2, Math.round(RIVER_SAMPLES / segs));
    pts = sampleSpline(riverControls(river), perSeg);
    polylineCache.set(river.id, pts);
  }
  return pts;
}

/** Distance from (x,z) to a polyline (XZ). */
export function distToPolyline(x, z, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i].x;
    const az = line[i].z;
    const bx = line[i + 1].x;
    const bz = line[i + 1].z;
    const abx = bx - ax;
    const abz = bz - az;
    const len2 = abx * abx + abz * abz;
    let t = 0;
    if (len2 > 1e-8) {
      t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / len2));
    }
    const px = ax + abx * t;
    const pz = az + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/** Distance to a river centerline. */
export function distToRiver(x, z, river) {
  return distToPolyline(x, z, riverPolyline(river));
}

/**
 * Nearest point on a river centerline.
 * @returns {{ x: number, z: number, dist: number, tApprox: number }}
 */
export function nearestOnRiver(x, z, river) {
  const line = riverPolyline(river);
  let best = { x: line[0]?.x ?? x, z: line[0]?.z ?? z, dist: Infinity, tApprox: 0 };
  let accum = 0;
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    total += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z);
  }
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i].x;
    const az = line[i].z;
    const bx = line[i + 1].x;
    const bz = line[i + 1].z;
    const abx = bx - ax;
    const abz = bz - az;
    const segLen = Math.hypot(abx, abz);
    const len2 = abx * abx + abz * abz;
    let t = 0;
    if (len2 > 1e-8) {
      t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / len2));
    }
    const px = ax + abx * t;
    const pz = az + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) {
      best = {
        x: px,
        z: pz,
        dist: d,
        tApprox: total > 1e-8 ? (accum + t * segLen) / total : 0
      };
    }
    accum += segLen;
  }
  return best;
}

/** True when inside any river bed (+ optional pad). */
export function isInAnyRiver(x, z, pad = 1.5) {
  const limit = RIVER_HALF_WIDTH + pad;
  for (let i = 0; i < RIVERS.length; i++) {
    if (distToRiver(x, z, RIVERS[i]) <= limit) return true;
  }
  return false;
}

/** Midpoint of the twin-river corridor (for streaming distance). */
export function riverCorridorCenter() {
  const mid = SPINE[Math.floor(SPINE.length / 2)];
  return {
    x: mid.x + RIVER_PAIR_GAP * 0.5,
    z: mid.z
  };
}

/**
 * Soft dome falloff height from the two channel mountains (0 outside).
 * Cosine-ish dome: height * cos(pi/2 * r/radius)^2 for r < radius.
 */
export function riverMountainHeight(x, z) {
  let h = 0;
  for (let i = 0; i < RIVER_MOUNTAINS.length; i++) {
    const m = RIVER_MOUNTAINS[i];
    const dx = x - m.cx;
    const dz = z - m.cz;
    const r = Math.hypot(dx, dz);
    if (r >= m.radius) continue;
    const u = r / m.radius;
    // Soft dome: (1 - u^2)^2
    const fall = (1 - u * u) * (1 - u * u);
    h += m.height * fall;
  }
  return h;
}

/** Midpoint sample on a river polyline (for validation markers). */
export function riverMidpoint(river) {
  const line = riverPolyline(river);
  if (!line.length) return { x: 0, z: 0 };
  return line[Math.floor(line.length / 2)];
}
