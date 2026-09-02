/**
 * Open countryside visual tiles (Passo 1).
 * 40×40 m PlaneGeometry ring around the city up to GROUND_BODY_HALF.
 * Stream tasks at priority 4 — after buildings.
 */

import * as THREE from 'three';
import {
  GROUND_BODY_HALF,
  isInsideCity
} from '../RoadDimensions.js';
import { chebyshev } from '../instancing.js';
import { beginLoad } from '../../engine/loadLog.js';
import { heightAt } from './heightField.js';

export const TERRAIN_TILE = 40;
export const TERRAIN_PRIORITY = 4;
/** ~2 m verts → 20 segments (21 verts per edge). */
const TILE_SEGS = 20;
const GRASS_HEX = 0x4a7c3f;

let sharedMaterial = null;

function grassMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ color: GRASS_HEX });
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
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x0 + TERRAIN_TILE * 0.5 + lx;
    const wz = z0 + TERRAIN_TILE * 0.5 + lz;
    pos.setY(i, heightAt(wx, wz));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, grassMaterial());
  mesh.position.set(x0 + TERRAIN_TILE * 0.5, 0, z0 + TERRAIN_TILE * 0.5);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = `terrain_${Math.round(x0 / TERRAIN_TILE)}_${Math.round(z0 / TERRAIN_TILE)}`;
  return mesh;
}

/**
 * Register one stream task per countryside tile (priority 4).
 */
export function registerTerrain(stream, parentGroup, ox, oz) {
  const group = new THREE.Group();
  group.name = 'terrain';
  parentGroup.add(group);

  for (const t of tileIndices()) {
    const dist = chebyshev(t.cx, t.cz, ox, oz);
    stream.addTask({
      dist,
      priority: TERRAIN_PRIORITY,
      run: async () => {
        beginLoad('terrain', `tile ${t.ix},${t.iz}`);
        group.add(buildTileMesh(t.x0, t.z0));
      }
    });
  }
}
