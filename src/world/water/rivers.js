/**
 * Coherent watershed: highland source → carved channel past the city → lake outfall.
 * Main stem uses Water.js; a shorter tributary uses Water2.js (still a twin compare).
 * Layout + helpers only — water meshes live in waterRiver / water2River.
 */

export const RIVER_HALF_WIDTH = 8.5;
export const RIVER_BLEND = 5;
export const RIVER_DEPTH = 2.6;
export const RIVER_SAMPLES = 128;
export const RIVER_CROSS = 8;

/**
 * Main stem control points (source high NE → lake south).
 * Heights are implied by terrain; water profile is monotone downhill.
 */
export const MAIN_SPINE = [
  { x: 1380, z: 1520 }, // highland spring
  { x: 1200, z: 1280 },
  { x: 1040, z: 1080 },
  { x: 860, z: 820 },
  { x: 700, z: 520 },
  { x: 580, z: 280 },
  { x: 520, z: 120 }, // east of city
  { x: 480, z: -40 },
  { x: 420, z: -280 },
  { x: 360, z: -560 },
  { x: 300, z: -820 },
  { x: 250, z: -1020 }, // into lakeshore
  { x: 220, z: -1120 }
];

/** Tributary from rocky foothills joining the main stem. */
export const TRIB_SPINE = [
  { x: 980, z: -380 },
  { x: 820, z: -300 },
  { x: 680, z: -180 },
  { x: 560, z: -40 },
  { x: 500, z: 40 } // joins near main corridor
];

/** Soft mountains that channel the valley (outside city). */
export const RIVER_MOUNTAINS = [
  { id: 'mt-source', cx: 1280, cz: 1400, radius: 220, height: 55 },
  { id: 'mt-ridge-w', cx: 880, cz: 900, radius: 180, height: 42 },
  { id: 'mt-east-channel', cx: 640, cz: 200, radius: 140, height: 28 },
  { id: 'mt-rocky', cx: 900, cz: -480, radius: 160, height: 36 }
];

export const RIVER_WATER = {
  id: 'river-main',
  kind: 'water',
  label: 'Water.js main stem',
  spine: MAIN_SPINE,
  halfWidth: RIVER_HALF_WIDTH,
  depth: RIVER_DEPTH,
  /** Normalized arc position of source (1) → mouth (0) for sloping water. */
  sourceElevBias: 1
};

export const RIVER_WATER2 = {
  id: 'river-trib',
  kind: 'water2',
  label: 'Water2.js tributary',
  spine: TRIB_SPINE,
  halfWidth: RIVER_HALF_WIDTH * 0.75,
  depth: RIVER_DEPTH * 0.85,
  sourceElevBias: 1
};

export const RIVERS = [RIVER_WATER, RIVER_WATER2];

/** @deprecated kept for any stray twin-gap callers */
export const RIVER_PAIR_GAP = 0;
export const SPINE = MAIN_SPINE;

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

function riverControls(river) {
  return river.spine || MAIN_SPINE;
}

const polylineCache = new Map();

/** Sampled Catmull-Rom polyline for a river (cached). */
export function riverPolyline(river) {
  let pts = polylineCache.get(river.id);
  if (!pts) {
    const spine = riverControls(river);
    const segs = spine.length - 1;
    const perSeg = Math.max(2, Math.round(RIVER_SAMPLES / segs));
    pts = sampleSpline(spine, perSeg);
    // Attach arc-length parameter tNorm 0 at source → 1 at mouth
    let acc = 0;
    pts[0].s = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      pts[i].s = acc;
    }
    const total = acc || 1;
    for (let i = 0; i < pts.length; i++) {
      pts[i].tNorm = pts[i].s / total;
    }
    polylineCache.set(river.id, pts);
  }
  return pts;
}

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

export function distToRiver(x, z, river) {
  return distToPolyline(x, z, riverPolyline(river));
}

export function nearestOnRiver(x, z, river) {
  const line = riverPolyline(river);
  let best = {
    x: line[0]?.x ?? x,
    z: line[0]?.z ?? z,
    dist: Infinity,
    tApprox: 0
  };
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
    if (d < best.dist) {
      const tApprox = line[i].tNorm * (1 - t) + line[i + 1].tNorm * t;
      best = { x: px, z: pz, dist: d, tApprox };
    }
  }
  return best;
}

export function isInAnyRiver(x, z, pad = 1.5) {
  for (let i = 0; i < RIVERS.length; i++) {
    const hw = (RIVERS[i].halfWidth ?? RIVER_HALF_WIDTH) + pad;
    if (distToRiver(x, z, RIVERS[i]) <= hw) return true;
  }
  return false;
}

export function riverCorridorCenter() {
  const mid = MAIN_SPINE[Math.floor(MAIN_SPINE.length / 2)];
  return { x: mid.x, z: mid.z };
}

export function riverMountainHeight(x, z) {
  let h = 0;
  for (let i = 0; i < RIVER_MOUNTAINS.length; i++) {
    const m = RIVER_MOUNTAINS[i];
    const r = Math.hypot(x - m.cx, z - m.cz);
    if (r >= m.radius) continue;
    const u = r / m.radius;
    const fall = (1 - u * u) * (1 - u * u);
    h += m.height * fall;
  }
  return h;
}

export function riverMidpoint(river) {
  const line = riverPolyline(river);
  if (!line.length) return { x: 0, z: 0 };
  return line[Math.floor(line.length / 2)];
}

/** Human-readable flow summary for PR reports. */
export function riverFlowSummary() {
  return (
    'Main stem: Highland Source (1380,1520) → Ridge valley → east of downtown → ' +
    'south to Lakeshore outfall (220,-1120). Tributary: Rocky Foothills → joins main near (500,40). ' +
    'Beds carve downhill; water ribbons slope source→mouth.'
  );
}
