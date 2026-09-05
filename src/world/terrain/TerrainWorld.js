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
import { beginLoad, loadMark } from '../../engine/loadLog.js';
import { createSlice, throughValve } from '../yield.js';
import { surfaceY } from './paths.js';
import { terrainLambert, writeSplatColor } from './splatMaterial.js';
import {
  TERRAIN_TILE,
  TERRAIN_TILE_FAR,
  TERRAIN_NEAR_HALF,
  allTiles,
  setTerrainPhysics
} from './terrainCollision.js';

export { TERRAIN_TILE, TERRAIN_TILE_FAR, TERRAIN_NEAR_HALF };
export const TERRAIN_PRIORITY = 4;

/** Vert batches between valve ticks — keeps terrain mesh off the 4s hitch path. */
const VERT_BATCH = 48;

async function buildTileMesh(x0, z0, size, segs) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const slice = createSlice(3);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x0 + size * 0.5 + lx;
    const wz = z0 + size * 0.5 + lz;
    pos.setY(i, surfaceY(wx, wz));
    writeSplatColor(colors, i, wx, wz);
    if ((i + 1) % VERT_BATCH === 0) await slice.tick();
  }
  await slice.tick(true);
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, terrainLambert());
  mesh.position.set(x0 + size * 0.5, 0, z0 + size * 0.5);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = `terrain_${Math.round(x0 / size)}_${Math.round(z0 / size)}_${size}`;
  return mesh;
}

export function registerTerrain(stream, parentGroup, ox, oz, physicsWorld) {
  const group = new THREE.Group();
  group.name = 'terrain';
  parentGroup.add(group);

  setTerrainPhysics(physicsWorld);

  // Visual mesh only. Colliders stay on-demand via ensureGroundAround()
  // so the far vista can stream without Cannon heightfield spikes.
  for (const t of allTiles()) {
    const dist = chebyshev(t.cx, t.cz, ox, oz);
    stream.addTask({
      dist,
      priority: TERRAIN_PRIORITY,
      kind: 'terrain',
      run: async () => {
        const tag = t.far ? 'far' : 'near';
        const label = `mesh ${tag} ${t.x0},${t.z0}`;
        await throughValve(async () => {
          beginLoad('terrain', label);
          const t0 = performance.now();
          const mesh = await buildTileMesh(t.x0, t.z0, t.size, t.segs);
          group.add(mesh);
          loadMark('terrain', label, performance.now() - t0);
        });
      }
    });
  }
}
