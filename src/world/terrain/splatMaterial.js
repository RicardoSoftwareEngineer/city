/**
 * Terrain surface tint helpers.
 * One shared MeshLambertMaterial with vertexColors — grass / dirt / rock / asphalt
 * tinted by biome soft fields + path/avenue corridors.
 */

import * as THREE from 'three';
import { pathDirtFactor } from './paths.js';
import { slopeAt } from './heightField.js';
import { biomeGrassRgb, biomeRockRgb, biomeWetland } from './biomes.js';
import { avenueBlendFactor } from './countryAvenue.js';

export const GRASS_HEX = 0x4a7c3f;
export const DIRT_HEX = 0x8b7355;
export const ROCK_HEX = 0x6b6560;
export const ASPHALT_HEX = 0x2f2f33;

/** Slope above this starts mixing rock. */
export const ROCK_SLOPE = 0.65;

const dirtColor = new THREE.Color(DIRT_HEX);
const asphaltColor = new THREE.Color(ASPHALT_HEX);
const mixColor = new THREE.Color();
const grassTmp = new THREE.Color();
const rockTmp = new THREE.Color();
const rgb = [0, 0, 0];

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

export function setTerrainWireframe(on) {
  terrainLambert().wireframe = Boolean(on);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Write RGB for world (x,z) into colors[i*3..].
 */
export function writeSplatColor(colors, i, x, z) {
  biomeGrassRgb(x, z, rgb);
  grassTmp.setRGB(rgb[0], rgb[1], rgb[2]);
  biomeRockRgb(x, z, rgb);
  rockTmp.setRGB(rgb[0], rgb[1], rgb[2]);

  const wet = biomeWetland(x, z);
  if (wet > 0.05) {
    grassTmp.lerp(new THREE.Color(0x3a5c48), wet * 0.55);
  }

  const dirt = pathDirtFactor(x, z);
  mixColor.copy(grassTmp).lerp(dirtColor, dirt);

  if (dirt < 0.85) {
    const slope = slopeAt(x, z);
    const rockAmt = smoothstep(ROCK_SLOPE, 0.95, slope) * (1 - dirt);
    if (rockAmt > 0) mixColor.lerp(rockTmp, rockAmt);
  }

  const ave = avenueBlendFactor(x, z);
  if (ave > 0) mixColor.lerp(asphaltColor, ave);

  colors[i * 3] = mixColor.r;
  colors[i * 3 + 1] = mixColor.g;
  colors[i * 3 + 2] = mixColor.b;
}
