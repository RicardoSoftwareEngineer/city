/**
 * Loads the 7 official Source prefabs, orients them for the grid, then
 * merges by material for InstancedMesh.
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { BUILDING_SPECS, buildingUrl } from './specs.js';
import { mergeBuilding } from './merge.js';
import { prepareInteriors } from './interiors.js';
import { waitUntilSmooth } from '../yield.js';

let slots = BUILDING_SPECS.map(() => null);

export async function getBuildingTemplate(index) {
  if (!slots[index]) {
    const spec = BUILDING_SPECS[index];
    slots[index] = (async () => {
      const root = await loadGltf(buildingUrl(spec), { keepVertexColors: true, useLambert: true });
      if (!root) return emptyPlaceholder(spec);
      await prepareInteriors(root, spec.id % 2);
      if (spec.name.startsWith('Large')) await waitUntilSmooth(42);
      return await mergeBuilding(prepareSourceBuilding(root, spec), spec.file);
    })();
  }
  return slots[index];
}

export async function getBuildingCatalog() {
  return Promise.all(BUILDING_SPECS.map((_, i) => getBuildingTemplate(i)));
}

/**
 * Kit buildings occupy −Z with the facade near Z = 0 facing +Z.
 * Rotate 180° so the facade faces −Z and the footprint goes into +Z,
 * then sit on the ground with X centered and the facade on Z = 0.
 */
function prepareSourceBuilding(root, spec) {
  const holder = new THREE.Group();
  holder.name = spec.name;
  root.rotation.y = Math.PI;
  holder.add(root);
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder);
  holder.position.x -= (box.min.x + box.max.x) * 0.5;
  holder.position.y -= box.min.y;
  holder.position.z -= box.min.z;
  holder.updateMatrixWorld(true);

  const placed = new THREE.Box3().setFromObject(holder);
  const size = placed.getSize(new THREE.Vector3());
  holder.userData.specId = spec.id;
  holder.userData.collider = {
    width: size.x,
    depth: size.z,
    height: size.y,
    centerZ: size.z * 0.5
  };
  return holder;
}

function emptyPlaceholder(spec) {
  const group = new THREE.Group();
  group.name = spec.name;
  group.userData.specId = spec.id;
  group.userData.collider = { width: 8, depth: 8, height: 12, centerZ: 4 };
  return group;
}
