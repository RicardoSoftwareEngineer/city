/**
 * Terrain surface tint helpers (Passo 11).
 * One shared MeshLambertMaterial with vertexColors — no Standard PBR,
 * no multi-texture splat shader. Colors encode grass / dirt / rock.
 */

import * as THREE from 'three';
import { pathDirtFactor } from './paths.js';
import { slopeAt } from './heightField.js';

export const GRASS_HEX = 0x4a7c3f;
export const DIRT_HEX = 0x8b7355;
export const ROCK_HEX = 0x6b6560;

/** Slope above this starts mixing rock (Passo 11). */
export const ROCK_SLOPE = 0.65;

const grassColor = new THREE.Color(GRASS_HEX);
const dirtColor = new THREE.Color(DIRT_HEX);
const rockColor = new THREE.Color(ROCK_HEX);
const mixColor = new THREE.Color();

let sharedMaterial = null;

export function terrainLambert() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      color: 0xffffff
    });
  }
  return sharedMaterial;
}

/** Debug: paint the terrain as wireframe (one shared material, one flag). */
export function setTerrainWireframe(on) {
  terrainLambert().wireframe = Boolean(on);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Write RGB for world (x,z) into colors[i*3..].
 * Path bed stays dirt; steep slopes mix rock; else grass.
 */
export function writeSplatColor(colors, i, x, z) {
  const dirt = pathDirtFactor(x, z);
  mixColor.copy(grassColor).lerp(dirtColor, dirt);

  if (dirt < 0.85) {
    const slope = slopeAt(x, z);
    const rockAmt = smoothstep(ROCK_SLOPE, 0.95, slope) * (1 - dirt);
    if (rockAmt > 0) mixColor.lerp(rockColor, rockAmt);
  }

  colors[i * 3] = mixColor.r;
  colors[i * 3 + 1] = mixColor.g;
  colors[i * 3 + 2] = mixColor.b;
}
