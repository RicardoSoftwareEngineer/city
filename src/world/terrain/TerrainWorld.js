/**
 * Open countryside visual tiles + per-tile Cannon Heightfield.
 * Near city: fine 40 m tiles. Far vista: coarse 80 m tiles so we can
 * stretch to GROUND_BODY_HALF without flooding the stream with tasks.
 * Y uses shared surfaceY — same for mesh + Heightfield.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  GROUND_BODY_HALF,
  isInsideCity
} from '../RoadDimensions.js';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { surfaceY } from './paths.js';
import { terrainLambert, writeSplatColor } from './splatMaterial.js';

export const TERRAIN_TILE = 40;
export const TERRAIN_TILE_FAR = 80;
/** Fine ring half-extent; beyond this only coarse tiles. */
export const TERRAIN_NEAR_HALF = 320;
export const TERRAIN_PRIORITY = 4;

const NEAR_SEGS = 20;
const FAR_SEGS = 10;

/** Reused for every tile Heightfield: -PI/2 on X so local Z heights → world Y. */
const HF_QUAT = new CANNON.Quaternion();
HF_QUAT.setFromEuler(-Math.PI / 2, 0, 0);

function coversNearOnly(x0, z0, size) {
  const x1 = x0 + size;
  const z1 = z0 + size;
  const h = TERRAIN_NEAR_HALF;
  return x0 >= -h && x1 <= h && z0 >= -h && z1 <= h;
}

function tileIndices() {
  const out = [];
  const nearHalf = TERRAIN_NEAR_HALF;
  const farHalf = GROUND_BODY_HALF;

  for (let x0 = -nearHalf; x0 < nearHalf; x0 += TERRAIN_TILE) {
    for (let z0 = -nearHalf; z0 < nearHalf; z0 += TERRAIN_TILE) {
      const cx = x0 + TERRAIN_TILE * 0.5;
      const cz = z0 + TERRAIN_TILE * 0.5;
      if (isInsideCity(cx, cz)) continue;
      out.push({
        ix: Math.round(x0 / TERRAIN_TILE),
        iz: Math.round(z0 / TERRAIN_TILE),
        x0,
        z0,
        cx,
        cz,
        size: TERRAIN_TILE,
        segs: NEAR_SEGS,
        far: false
      });
    }
  }

  for (let x0 = -farHalf; x0 < farHalf; x0 += TERRAIN_TILE_FAR) {
    for (let z0 = -farHalf; z0 < farHalf; z0 += TERRAIN_TILE_FAR) {
      if (coversNearOnly(x0, z0, TERRAIN_TILE_FAR)) continue;
      const cx = x0 + TERRAIN_TILE_FAR * 0.5;
      const cz = z0 + TERRAIN_TILE_FAR * 0.5;
      if (isInsideCity(cx, cz)) continue;
      out.push({
        ix: Math.round(x0 / TERRAIN_TILE_FAR) + 1000,
        iz: Math.round(z0 / TERRAIN_TILE_FAR) + 1000,
        x0,
        z0,
        cx,
        cz,
        size: TERRAIN_TILE_FAR,
        segs: FAR_SEGS,
        far: true
      });
    }
  }
  return out;
}

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

function buildTileHeightfield(physicsWorld, x0, z0, size, segs) {
  const n = segs + 1;
  const elementSize = size / segs;
  const matrix = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const wx = x0 + i * elementSize;
      const wz = z0 + (n - 1 - j) * elementSize;
      row.push(surfaceY(wx, wz));
    }
    matrix.push(row);
  }
  const position = new CANNON.Vec3(x0, 0, z0 + size);
  physicsWorld.addHeightfield(matrix, elementSize, position, HF_QUAT);
}

export function registerTerrain(stream, parentGroup, ox, oz, physicsWorld) {
  const group = new THREE.Group();
  group.name = 'terrain';
  parentGroup.add(group);

  stream.addTask({
    dist: 0,
    priority: TERRAIN_PRIORITY,
    run: async () => {
      beginLoad('path', 'network 4 exits + link');
    }
  });

  for (const t of tileIndices()) {
    const dist = chebyshev(t.cx, t.cz, ox, oz);
    stream.addTask({
      dist,
      priority: TERRAIN_PRIORITY,
      run: async () => {
        const tag = t.far ? 'far' : 'near';
        beginLoad('terrain', `mesh ${tag} ${t.ix},${t.iz}`);
        group.add(buildTileMesh(t.x0, t.z0, t.size, t.segs));
        if (physicsWorld) {
          beginLoad('terrain', `phys ${tag} ${t.ix},${t.iz}`);
          buildTileHeightfield(physicsWorld, t.x0, t.z0, t.size, t.segs);
        }
      }
    });
  }
}
