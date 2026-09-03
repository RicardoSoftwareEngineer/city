/**
 * Open countryside visual tiles.
 * Near city: fine 40 m tiles. Far vista: coarse 80 m tiles so we can
 * stretch to GROUND_BODY_HALF without flooding the stream with tasks.
 *
 * Colliders live in terrainCollision.js — they share this grid and the same
 * surfaceY, but are also built on demand under the car so driving past the
 * streamed radius can never drop you through the world.
 */

import * as THREE from 'three';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { surfaceY } from './paths.js';
import { terrainLambert, writeSplatColor } from './splatMaterial.js';
import {
  TERRAIN_TILE,
  TERRAIN_TILE_FAR,
  TERRAIN_NEAR_HALF,
  allTiles,
  ensureTile,
  setTerrainPhysics
} from './terrainCollision.js';

export { TERRAIN_TILE, TERRAIN_TILE_FAR, TERRAIN_NEAR_HALF };
export const TERRAIN_PRIORITY = 4;

function buildTileMesh(x0, z0, size, segs) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x0 + size * 0.5 + lx;
    const wz = z0 + size * 0.5 + lz;
    pos.setY(i, surfaceY(wx, wz));
    writeSplatColor(colors, i, wx, wz);
  }
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

  stream.addTask({
    dist: 0,
    priority: TERRAIN_PRIORITY,
    run: async () => {
      beginLoad('path', 'network 4 exits + link');
    }
  });

  for (const t of allTiles()) {
    const dist = chebyshev(t.cx, t.cz, ox, oz);
    stream.addTask({
      dist,
      priority: TERRAIN_PRIORITY,
      run: async () => {
        const tag = t.far ? 'far' : 'near';
        beginLoad('terrain', `mesh ${tag} ${t.x0},${t.z0}`);
        group.add(buildTileMesh(t.x0, t.z0, t.size, t.segs));
        if (physicsWorld && ensureTile(t)) {
          beginLoad('terrain', `phys ${tag} ${t.x0},${t.z0}`);
        }
      }
    });
  }
}
