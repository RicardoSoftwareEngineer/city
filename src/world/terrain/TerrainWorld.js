/**
 * Open countryside visual tiles.
 * Near city: fine 40 m tiles. Far vista: coarse 80 m tiles so we can
 * stretch to GROUND_BODY_HALF without flooding the stream with tasks.
 *
 * Colliders live in terrainCollision.js — same grid/surfaceY, built only
 * on demand under the car (ensureGroundAround). The visual stream is mesh-only
 * and is pumped first (pumpTerrainTo) so the far vista appears before city glTF.
 */

import * as THREE from 'three';
import { chebyshev } from '../instancing.js';
import { beginLoad, clearLoadTag, loadMark } from '../../engine/loadLog.js';
import { throughValve, yieldToMain } from '../yield.js';
import { memoryGuardian } from '../../engine/memoryGuardian.js';
import { surfaceY } from './paths.js';
import { terrainLambert, writeSplatColor } from './splatMaterial.js';
import {
  TERRAIN_TILE,
  TERRAIN_TILE_FAR,
  TERRAIN_NEAR_HALF,
  allTiles,
  setTerrainPhysics
} from './terrainCollision.js';
import { ensureWhiteOrchardHeightmap } from './whiteOrchardHeight.js';

export { TERRAIN_TILE, TERRAIN_TILE_FAR, TERRAIN_NEAR_HALF };
export const TERRAIN_PRIORITY = 4;

/**
 * CPU time budget per sync stretch — plain yieldToMain only.
 * NEVER holdForTargetFps / createSlice HOLD inside the vert loop (#91).
 * Fixed VERT_BATCH=96 was ~10ms+ of surfaceY on mid boxes and multi-10ms on
 * Windows; wall-clock loadMark then blamed yield waits / Valve HOLD on terrain.
 */
const SLICE_MS = 3.5;

async function buildTileMesh(x0, z0, size, segs, label = "mesh") {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cols = segs + 1;
  const step = size / segs;
  const heights = new Float32Array(pos.count);
  const worldX = new Float32Array(pos.count);
  const worldZ = new Float32Array(pos.count);

  let cpuMs = 0;
  let sliceStart = performance.now();

  async function yieldSlice() {
    const now = performance.now();
    cpuMs += now - sliceStart;
    // Drop hitch tag across the await so Valve HOLD / pauseDraw gaps are not
    // Travamentos-blamed on this terrain tile.
    clearLoadTag();
    await yieldToMain();
    beginLoad('terrain', label);
    sliceStart = performance.now();
  }

  // Pass 1 — heights only (so grid slopes are complete before tint).
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x0 + size * 0.5 + lx;
    const wz = z0 + size * 0.5 + lz;
    worldX[i] = wx;
    worldZ[i] = wz;
    const y = surfaceY(wx, wz);
    heights[i] = y;
    pos.setY(i, y);
    // Only await when the CPU budget is spent — never per-vert microtask yield.
    if (performance.now() - sliceStart >= SLICE_MS) await yieldSlice();
  }
  pos.needsUpdate = true;

  // Pass 2 — vertex colors using finished height grid (no slopeAt×4).
  for (let i = 0; i < pos.count; i++) {
    writeSplatColor(colors, i, worldX[i], worldZ[i], gridSlope(heights, i, cols, step));
    if (performance.now() - sliceStart >= SLICE_MS) await yieldSlice();
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  cpuMs += performance.now() - sliceStart;
  beginLoad('terrain', label);
  const n0 = performance.now();
  geo.computeVertexNormals();
  cpuMs += performance.now() - n0;
  clearLoadTag();
  await yieldToMain();
  beginLoad('terrain', label);
  sliceStart = performance.now();

  const mesh = new THREE.Mesh(geo, terrainLambert());
  mesh.position.set(x0 + size * 0.5, 0, z0 + size * 0.5);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = `terrain_${Math.round(x0 / size)}_${Math.round(z0 / size)}_${size}`;

  cpuMs += performance.now() - sliceStart;
  return { mesh, cpuMs };
}

/** Approximate |grad h| from the finished tile height grid. */
function gridSlope(heights, i, cols, step) {
  const row = (i / cols) | 0;
  const col = i % cols;
  const left = col > 0 ? heights[i - 1] : heights[i];
  const right = col + 1 < cols ? heights[i + 1] : heights[i];
  const up = row > 0 ? heights[i - cols] : heights[i];
  const down = row + 1 < cols ? heights[i + cols] : heights[i];
  const dx = (right - left) / ((col > 0 && col + 1 < cols ? 2 : 1) * step);
  const dz = (down - up) / ((row > 0 && row + 1 < cols ? 2 : 1) * step);
  return Math.hypot(dx, dz);
}

export async function registerTerrain(stream, parentGroup, ox, oz, physicsWorld) {
  // Decode heightmap before any tile samples heightAt (mesh + phys share surfaceY).
  await ensureWhiteOrchardHeightmap();

  const group = new THREE.Group();
  group.name = 'terrain';
  parentGroup.add(group);

  setTerrainPhysics(physicsWorld);

  // Visual mesh only. Colliders stay on-demand via ensureGroundAround()
  // so the far vista can stream without Cannon heightfield spikes.
  for (const t of allTiles()) {
    const dist = chebyshev(t.cx, t.cz, ox, oz);
    const residentId = `terrain:${t.key}`;
    const task = {
      dist,
      priority: TERRAIN_PRIORITY,
      kind: 'terrain',
      x: t.cx,
      z: t.cz,
      done: false,
      building: false,
      run: null
    };
    task.run = async () => {
      if (task.building || task.done) return false;
      if (!memoryGuardian.allowsAt(t.cx, t.cz)) return false;
      task.building = true;
      const tag = t.far ? 'far' : 'near';
      const label = `mesh ${tag} ${t.x0},${t.z0}`;
      let mesh = null;
      try {
        // Build outside throughValve — Valve HOLD must not wrap the vert loop.
        beginLoad('terrain', label);
        const built = await buildTileMesh(t.x0, t.z0, t.size, t.segs, label);
        mesh = built.mesh;
        // CPU-only — yield waits must not look like multi-second LOAD hitches.
        beginLoad('terrain', label);
        loadMark('terrain', label, built.cpuMs);
        await throughValve(async () => {
          group.add(mesh);
        });
        if (!mesh) return false;
        memoryGuardian.retain(residentId, {
          kind: 'terrain',
          x: t.cx,
          z: t.cz,
          dispose: () => {
            if (mesh.parent) mesh.parent.remove(mesh);
            mesh.geometry?.dispose();
            // terrainLambert is shared — do not dispose material
            mesh = null;
            task.done = false;
            task.building = false;
          }
        });
        return true;
      } finally {
        task.building = false;
      }
    };
    stream.addTask(task);
  }
}
