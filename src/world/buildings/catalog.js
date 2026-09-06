/**
 * Loads the 7 official Source prefabs, orients them for the grid, then
 * merges by material for InstancedMesh.
 *
 * Window slots are extracted and FakeInterior/MI_Glass become real glass
 * before merge (spec 05). Interiors are on-demand overlays, not emissive paint.
 */

import * as THREE from 'three';
import { loadGltf } from '../AssetLoader.js';
import { BUILDING_SPECS, buildingUrl } from './specs.js';
import { mergeBuilding } from './merge.js';
import { extractWindowSlots } from '../apartments/slots.js';
import { applyWindowGlass } from '../apartments/glass.js';
import { waitUntilSmooth } from '../yield.js';

let slots = BUILDING_SPECS.map(() => null);

export async function getBuildingTemplate(index) {
  if (!slots[index]) {
    const spec = BUILDING_SPECS[index];
    slots[index] = (async () => {
      const root = await loadGltf(buildingUrl(spec), { keepVertexColors: false });
      if (!root) return emptyPlaceholder(spec);
      const prepared = prepareSourceBuilding(root, spec);
      const apartmentSlots = extractWindowSlots(prepared);
      applyWindowGlass(prepared);
      if (spec.name.startsWith('Large')) await waitUntilSmooth();
      const merged = await mergeBuilding(prepared, spec.file);
      merged.userData.apartmentSlots = apartmentSlots;
      return merged;
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
  group.userData.apartmentSlots = [];
  return group;
}
