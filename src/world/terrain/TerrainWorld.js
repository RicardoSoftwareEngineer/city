/**
 * Open countryside visual tiles + per-tile Cannon Heightfield (Passo 1–3, 8–9).
 * 40×40 m PlaneGeometry ring around the city up to GROUND_BODY_HALF.
 * Vertex colors paint dirt path beds; Y uses shared surfaceY (path groove).
 * Stream tasks at priority 4 — after buildings.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  GROUND_BODY_HALF,
  isInsideCity
} from '../RoadDimensions.js';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { pathDirtFactor, surfaceY } from './paths.js';

export const TERRAIN_TILE = 40;
export const TERRAIN_PRIORITY = 4;
/** ~2 m verts → 20 segments (21 verts per edge). */
const TILE_SEGS = 20;
const GRASS_HEX = 0x4a7c3f;
const DIRT_HEX = 0x8b7355;

const grassColor = new THREE.Color(GRASS_HEX);
const dirtColor = new THREE.Color(DIRT_HEX);
const mixColor = new THREE.Color();

let sharedMaterial = null;

/** Reused for every tile Heightfield: -PI/2 on X so local Z heights → world Y. */
const HF_QUAT = new CANNON.Quaternion();
HF_QUAT.setFromEuler(-Math.PI / 2, 0, 0);

function terrainMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      color: 0xffffff
    });
  }
  return sharedMaterial;
}

function tileIndices() {
  const out = [];
  const half = GROUND_BODY_HALF;
  for (let x0 = -half; x0 < half; x0 += TERRAIN_TILE) {
    for (let z0 = -half; z0 < half; z0 += TERRAIN_TILE) {
      const cx = x0 + TERRAIN_TILE * 0.5;
      const cz = z0 + TERRAIN_TILE * 0.5;
      // Hole: skip tiles whose center is fully inside the city AABB.
      if (isInsideCity(cx, cz)) continue;
      out.push({
        ix: Math.round(x0 / TERRAIN_TILE),
        iz: Math.round(z0 / TERRAIN_TILE),
        x0,
        z0,
        cx,
        cz
      });
    }
  }
  return out;
}

function buildTileMesh(x0, z0) {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_TILE,
    TERRAIN_TILE,
    TILE_SEGS,
    TILE_SEGS
  );
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x0 + TERRAIN_TILE * 0.5 + lx;
    const wz = z0 + TERRAIN_TILE * 0.5 + lz;
    pos.setY(i, surfaceY(wx, wz));

    const dirt = pathDirtFactor(wx, wz);
    mixColor.copy(grassColor).lerp(dirtColor, dirt);
    colors[i * 3] = mixColor.r;
    colors[i * 3 + 1] = mixColor.g;
    colors[i * 3 + 2] = mixColor.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.position.set(x0 + TERRAIN_TILE * 0.5, 0, z0 + TERRAIN_TILE * 0.5);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = `terrain_${Math.round(x0 / TERRAIN_TILE)}_${Math.round(z0 / TERRAIN_TILE)}`;
  return mesh;
}

/**
 * Sample the same (TILE_SEGS+1)² grid as the visual mesh.
 * Heights use surfaceY so the car follows the path groove.
 */
function buildTileHeightfield(physicsWorld, x0, z0) {
  const n = TILE_SEGS + 1;
  const elementSize = TERRAIN_TILE / TILE_SEGS;
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
  const position = new CANNON.Vec3(x0, 0, z0 + TERRAIN_TILE);
  physicsWorld.addHeightfield(matrix, elementSize, position, HF_QUAT);
}

/**
 * Register one stream task per countryside tile (priority 4).
 * Each task builds the visual mesh and its matching Heightfield.
 */
export function registerTerrain(stream, parentGroup, ox, oz, physicsWorld) {
  const group = new THREE.Group();
  group.name = 'terrain';
  parentGroup.add(group);

  // One-shot tag so hitch logs show path network (seed-fixed, rebuilt at init).
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
        beginLoad('terrain', `mesh ${t.ix},${t.iz}`);
        group.add(buildTileMesh(t.x0, t.z0));
        if (physicsWorld) {
          beginLoad('terrain', `phys ${t.ix},${t.iz}`);
          buildTileHeightfield(physicsWorld, t.x0, t.z0);
        }
      }
    });
  }
}
