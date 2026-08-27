/**
 * Shared Downtown Source pieces used by the unused modular assembler.
 */

import { loadGltf } from '../AssetLoader.js';
import { downtown } from '../downtownSrc.js';
import { prepareInteriors } from './interiors.js';

const PATHS = {
  shopWindow:   downtown('Trim_FirstFloor_Window.gltf'),
  shopColumns:  downtown('Trim_FirstFloor_Window_Columns.gltf'),
  groundWall:   downtown('Trim_FirstFloor_Wall.gltf'),
  window:       downtown('Trim_Window.gltf'),
  plainWall:    downtown('Trim_Plain_3.gltf'),
  corner:       downtown('Trim_Corner.gltf'),
  columnBottom: downtown('Trim_Column_Bottom.gltf'),
  columnCenter: downtown('Trim_Column_Center.gltf'),
  columnTop:    downtown('Trim_Column_Top.gltf'),
  corniceTrim:  downtown('Cornice_Trim_Center.gltf'),
  corniceBrick: downtown('Cornice_Brick_Center.gltf'),
  corniceMetal: downtown('Cornice_Metal_Center.gltf'),
  cornice90:    downtown('Cornice_Trim_90Angle_L.gltf'),
  entrance:     downtown('Entrance_Concrete_2x1.gltf'),
  doorFrame:    downtown('DoorFrame_Trim.gltf'),
  door:         downtown('Door_1.gltf'),
  roofCenter:   downtown('Roof_SlateCornice_Center.gltf'),
  roofCorner:   downtown('Roof_SlateCornice_Corner.gltf')
};

export async function loadBuildingKit() {
  const keys = Object.keys(PATHS);
  const models = await Promise.all(keys.map((k) => loadGltf(PATHS[k], { keepVertexColors: true })));
  const kit = {};
  keys.forEach((k, i) => { kit[k] = models[i]; });

  await prepareInteriors(kit.shopWindow, 0);
  await prepareInteriors(kit.window, 1);
  return kit;
}

export function addPiece(group, template, x, y, z, rotationY = 0) {
  if (!template) return;
  const mesh = template.clone();
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  group.add(mesh);
}
