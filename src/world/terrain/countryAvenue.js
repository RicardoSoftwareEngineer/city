/**
 * Continuous primary countryside avenue: downtown → all biomes.
 * Road grade is locked to a smooth profile so mesh + Heightfield match
 * (no bouncing). Bridges lift over rivers; tunnels cut ridges.
 */

import * as THREE from 'three';
import { cityBounds, isInsideCity, ASPHALT_SURFACE_Y } from '../RoadDimensions.js';
import { chebyshev } from '../instancing.js';
import { beginLoad, loadMark } from '../../engine/loadLog.js';
import { createSlice, throughValve } from '../yield.js';
import { memoryGuardian } from '../../engine/memoryGuardian.js';

export const AVENUE_HALF_WIDTH = 5.5;
export const AVENUE_BLEND = 2.5;
export const AVENUE_SHOULDER = 8;
/** Max |dy/ds| along the graded profile (gentle grades). */
export const AVENUE_MAX_GRADE = 0.045;

/**
 * Control points: leave downtown on the east mid-street, tour every biome,
 * return toward the north edge. Bridges / tunnels marked by flags on spans.
 */
export const AVENUE_CONTROLS = [
  // Downtown connection (east mid of 4×4 grid, on asphalt height)
  { x: 180, z: 90, bridge: false, tunnel: false },
  { x: 230, z: 100, bridge: false, tunnel: false },
  // Meadow Hills
  { x: 420, z: 140, bridge: false, tunnel: false },
  // Bridge over main river toward rocky
  { x: 560, z: 40, bridge: true, tunnel: false },
  { x: 700, z: -80, bridge: false, tunnel: false },
  // Rocky Foothills
  { x: 820, z: -420, bridge: false, tunnel: false },
  // Toward lakeshore / wetland
  { x: 520, z: -780, bridge: false, tunnel: false },
  // Lakeshore (south)
  { x: 220, z: -1080, bridge: false, tunnel: false },
  // Wetland Marsh
  { x: -180, z: -780, bridge: true, tunnel: false },
  // Open Pasture (west)
  { x: -900, z: -200, bridge: false, tunnel: false },
  // Deep Forest (NW)
  { x: -720, z: 520, bridge: false, tunnel: false },
  // Climb toward ridge — tunnel through Mountain Ridge
  { x: 200, z: 780, bridge: false, tunnel: false },
  { x: 700, z: 920, bridge: false, tunnel: true },
  { x: 980, z: 980, bridge: false, tunnel: true },
  { x: 1180, z: 1180, bridge: false, tunnel: false },
  // Highland Source overlook
  { x: 1320, z: 1480, bridge: false, tunnel: false },
  // Descend back toward city north approach
  { x: 900, z: 1200, bridge: false, tunnel: false },
  { x: 400, z: 700, bridge: false, tunnel: false },
  { x: 90, z: 260, bridge: false, tunnel: false },
  // Re-enter downtown from north mid-street
  { x: 90, z: 180, bridge: false, tunnel: false }
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

function sampleSpline(controls, samplesPerSeg = 14) {
  const pts = [];
  const n = controls.length;
  if (n < 2) return pts;
  for (let i = 0; i < n - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(n - 1, i + 2)];
    const bridge = Boolean(p1.bridge || p2.bridge);
    const tunnel = Boolean(p1.tunnel || p2.tunnel);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      pts.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
        bridge,
        tunnel
      });
    }
  }
  const last = controls[n - 1];
  pts.push({
    x: last.x,
    z: last.z,
    bridge: Boolean(last.bridge),
    tunnel: Boolean(last.tunnel)
  });
  return pts;
}

/** @type {{ x:number, z:number, bridge:boolean, tunnel:boolean, s:number, y:number }[]} */
let poly = [];
let totalLen = 0;

function rebuildPoly() {
  const raw = sampleSpline(AVENUE_CONTROLS, 16);
  poly = [];
  totalLen = 0;
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i === 0) {
      poly.push({ ...p, s: 0, y: 0 });
    } else {
      const prev = poly[poly.length - 1];
      const ds = Math.hypot(p.x - prev.x, p.z - prev.z);
      totalLen += ds;
      poly.push({ ...p, s: totalLen, y: 0 });
    }
  }
}

rebuildPoly();

/**
 * Assign graded Y along the avenue using a raw height sampler.
 * Called once from heightField after uncarvedHeightAt exists (lazy).
 * @param {(x:number,z:number)=>number} rawHeightFn
 */
export function bakeAvenueProfile(rawHeightFn) {
  if (!poly.length) rebuildPoly();
  // Seed with terrain samples, lift bridges, cut tunnels.
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    let y = rawHeightFn(p.x, p.z);
    if (isInsideCity(p.x, p.z)) y = ASPHALT_SURFACE_Y;
    if (p.bridge) y = Math.max(y, rawHeightFn(p.x, p.z) + 4.5);
    if (p.tunnel) y = Math.min(y, rawHeightFn(p.x, p.z) - 6);
    // Keep city approaches near street height.
    const b = cityBounds();
    const nearCity =
      p.x >= b.minX - 40 &&
      p.x <= b.maxX + 40 &&
      p.z >= b.minZ - 40 &&
      p.z <= b.maxZ + 40;
    if (nearCity) y = Math.min(y, 1.2);
    p.y = y;
  }
  // Forward grade clamp
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const ds = Math.max(0.01, b.s - a.s);
    const maxDy = AVENUE_MAX_GRADE * ds;
    const dy = b.y - a.y;
    if (dy > maxDy) b.y = a.y + maxDy;
    if (dy < -maxDy) b.y = a.y - maxDy;
  }
  // Backward grade clamp
  for (let i = poly.length - 2; i >= 0; i--) {
    const a = poly[i];
    const b = poly[i + 1];
    const ds = Math.max(0.01, b.s - a.s);
    const maxDy = AVENUE_MAX_GRADE * ds;
    const dy = a.y - b.y;
    if (dy > maxDy) a.y = b.y + maxDy;
    if (dy < -maxDy) a.y = b.y - maxDy;
  }
}

export function avenuePolyline() {
  return poly;
}

export function avenueLength() {
  return totalLen;
}

/**
 * Nearest point on avenue.
 * @returns {{ x:number, z:number, y:number, dist:number, s:number, bridge:boolean, tunnel:boolean }}
 */
export function nearestOnAvenue(x, z) {
  let best = {
    x: poly[0]?.x ?? x,
    z: poly[0]?.z ?? z,
    y: poly[0]?.y ?? 0,
    dist: Infinity,
    s: 0,
    bridge: false,
    tunnel: false
  };
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i].x;
    const az = poly[i].z;
    const bx = poly[i + 1].x;
    const bz = poly[i + 1].z;
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
      best = {
        x: px,
        z: pz,
        y: poly[i].y * (1 - t) + poly[i + 1].y * t,
        dist: d,
        s: poly[i].s * (1 - t) + poly[i + 1].s * t,
        bridge: poly[i].bridge || poly[i + 1].bridge,
        tunnel: poly[i].tunnel || poly[i + 1].tunnel
      };
    }
  }
  return best;
}

export function distToAvenue(x, z) {
  return nearestOnAvenue(x, z).dist;
}

export function isAvenueBed(x, z) {
  return distToAvenue(x, z) < AVENUE_HALF_WIDTH;
}

/**
 * Target road surface Y if inside corridor, else null.
 * Used by surfaceY so visual mesh and physics share the same grade.
 */
export function avenueSurfaceY(x, z) {
  const n = nearestOnAvenue(x, z);
  const outer = AVENUE_HALF_WIDTH + AVENUE_BLEND;
  if (n.dist >= outer) return null;
  // Full road height in bed; blend to null (caller keeps terrain) in blend zone.
  if (n.dist <= AVENUE_HALF_WIDTH) return n.y;
  const u = (n.dist - AVENUE_HALF_WIDTH) / AVENUE_BLEND;
  // Return blended marker via object? Callers need blend — use avenueBlendHeight.
  return n.y; // bed only path; blend handled in avenueBlendFactor
}

export function avenueBlendFactor(x, z) {
  const d = distToAvenue(x, z);
  if (d <= AVENUE_HALF_WIDTH) return 1;
  const outer = AVENUE_HALF_WIDTH + AVENUE_BLEND;
  if (d >= outer) return 0;
  const t = (d - AVENUE_HALF_WIDTH) / AVENUE_BLEND;
  return 1 - t;
}

/** Mix terrain height toward graded avenue profile. */
export function applyAvenueGrade(terrainY, x, z) {
  const n = nearestOnAvenue(x, z);
  const f = avenueBlendFactor(x, z);
  if (f <= 0) return terrainY;
  return terrainY * (1 - f) + n.y * f;
}

/**
 * Tunnel cut: lower terrain above the road tube so a bore opens through ridges.
 * Returns height delta (<=0).
 */
export function avenueTunnelCut(x, z, terrainY) {
  const n = nearestOnAvenue(x, z);
  if (!n.tunnel) return 0;
  const tubeR = AVENUE_HALF_WIDTH + 3.5;
  if (n.dist > tubeR + 4) return 0;
  const roadY = n.y;
  const ceiling = roadY + 5.5;
  // Outside the tube laterally, no cut.
  if (n.dist > tubeR) {
    const t = Math.min(1, (n.dist - tubeR) / 4);
    const target = terrainY * t + Math.min(terrainY, ceiling) * (1 - t);
    return target - terrainY;
  }
  // Inside tube: force terrain down to just above road (walls via lateral falloff)
  const wall = roadY + 0.4;
  if (terrainY <= wall) return 0;
  return wall - terrainY;
}

/**
 * Bridge: keep road high; no terrain raise required (road floats on grade).
 * Returns pier positions for mesh.
 */
export function avenueBridgeSpans() {
  const spans = [];
  let inSpan = false;
  let start = null;
  for (let i = 0; i < poly.length; i++) {
    if (poly[i].bridge && !inSpan) {
      inSpan = true;
      start = poly[i];
    } else if (!poly[i].bridge && inSpan) {
      spans.push({ a: start, b: poly[i - 1] });
      inSpan = false;
    }
  }
  if (inSpan) spans.push({ a: start, b: poly[poly.length - 1] });
  return spans;
}

const ASPHALT = new THREE.Color(0x2a2a2e);
const STRIPE = new THREE.Color(0xd4d4d8);

function buildRibbonGeometry() {
  const halfW = AVENUE_HALF_WIDTH;
  const cross = 6;
  const nAlong = poly.length;
  const cols = cross + 1;
  const positions = new Float32Array(nAlong * cols * 3);
  const colors = new Float32Array(nAlong * cols * 3);
  const indices = [];

  for (let i = 0; i < nAlong; i++) {
    const p = poly[i];
    let tx;
    let tz;
    if (i === 0) {
      tx = poly[1].x - p.x;
      tz = poly[1].z - p.z;
    } else if (i === nAlong - 1) {
      tx = p.x - poly[i - 1].x;
      tz = p.z - poly[i - 1].z;
    } else {
      tx = poly[i + 1].x - poly[i - 1].x;
      tz = poly[i + 1].z - poly[i - 1].z;
    }
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    const lx = -tz;
    const lz = tx;
    for (let c = 0; c < cols; c++) {
      const v = c / cross;
      const lat = (v * 2 - 1) * halfW;
      const wx = p.x + lx * lat;
      const wz = p.z + lz * lat;
      const wy = p.y + 0.04; // slight lift to avoid z-fight with terrain
      const vi = i * cols + c;
      positions[vi * 3] = wx;
      positions[vi * 3 + 1] = wy;
      positions[vi * 3 + 2] = wz;
      const stripe = Math.abs(v - 0.5) < 0.04;
      const col = stripe ? STRIPE : ASPHALT;
      colors[vi * 3] = col.r;
      colors[vi * 3 + 1] = col.g;
      colors[vi * 3 + 2] = col.b;
    }
  }
  for (let i = 0; i < nAlong - 1; i++) {
    for (let c = 0; c < cross; c++) {
      const a = i * cols + c;
      const b = a + 1;
      const d = (i + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBridgePiers(group) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x5c584f });
  for (const span of avenueBridgeSpans()) {
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = span.a.x * (1 - t) + span.b.x * t;
      const z = span.a.z * (1 - t) + span.b.z * t;
      const yTop = span.a.y * (1 - t) + span.b.y * t;
      const h = Math.max(2, yTop + 0.15 - (-2));
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, h, 1.4),
        mat
      );
      pier.position.set(x, yTop - h * 0.5, z);
      pier.castShadow = false;
      pier.receiveShadow = false;
      group.add(pier);
    }
  }
}

/**
 * Register streaming task for the country avenue ribbon + bridge piers.
 */
export function registerCountryAvenue(stream, parentGroup, ox, oz) {
  // Anchor streaming at the downtown east exit so the full ribbon appears
  // as soon as the player leaves the 4×4 — not only near the tour midpoint.
  const start = poly[0] || { x: 180, z: 90 };
  const dist = chebyshev(start.x, start.z, ox, oz);
  stream.addTask({
    dist,
    priority: 3,
    kind: 'avenue',
    x: start.x,
    z: start.z,
    run: async () => {
      await throughValve(async () => {
        beginLoad('avenue', 'country ribbon');
        const t0 = performance.now();
        const slice = createSlice(2);
        await slice.tick();
        const group = new THREE.Group();
        group.name = 'countryAvenue';
        const mesh = new THREE.Mesh(
          buildRibbonGeometry(),
          new THREE.MeshLambertMaterial({ vertexColors: true })
        );
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        group.add(mesh);
        buildBridgePiers(group);
        parentGroup.add(group);
        loadMark('avenue', 'country ribbon', performance.now() - t0);
        memoryGuardian.retain('avenue:country', {
          kind: 'world',
          x: start.x,
          z: start.z,
          dispose: () => {
            group.traverse((o) => {
              if (o.geometry) o.geometry.dispose();
              if (o.material) o.material.dispose();
            });
            if (group.parent) group.parent.remove(group);
          }
        });
      });
      return true;
    }
  });
}

/** Short route blurb for reports. */
export function avenueRouteSummary() {
  return (
    'Downtown east (180,90) → Meadow → river bridge → Rocky Foothills → ' +
    'Lakeshore → Wetland bridge → Pasture → Deep Forest → Ridge tunnel → ' +
    'Highland Source → north re-entry (90,180). ' +
    `~${Math.round(totalLen)} m graded corridor, max grade ${AVENUE_MAX_GRADE}.`
  );
}
