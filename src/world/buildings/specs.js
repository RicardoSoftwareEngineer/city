/**
 * The 7 official Downtown MegaKit Source prefabs.
 * Front of each prepared template is Z = 0, facing −Z, depth into +Z.
 */

export const BUILDING_SPECS = [
  { id: 1, name: 'Small_1', file: 'Building_Small_1.gltf' },
  { id: 2, name: 'Small_2', file: 'Building_Small_2.gltf' },
  { id: 3, name: 'Medium_1', file: 'Building_Medium_1.gltf' },
  { id: 4, name: 'Medium_2', file: 'Building_Medium_2.gltf' },
  { id: 5, name: 'Large_1', file: 'Building_Large_1.gltf' },
  { id: 6, name: 'Large_2', file: 'Building_Large_2.gltf' },
  { id: 7, name: 'Large_3', file: 'Building_Large_3.gltf' }
];

const DOWNTOWN_GLTF = '/models/downtown/Exports/glTF';

export function buildingUrl(spec) {
  return `${DOWNTOWN_GLTF}/${spec.file}`;
}

/** Used by the unused modular assembler. Source prefabs measure their own collider. */
export function buildingSize(spec) {
  const width = (spec.bays || 5) * 2;
  const depth = (spec.depth || 4) * 2;
  const height = (spec.floors || 4) * 3 + 2;
  return { width, depth, height };
}
