/**
 * BankBuilding — TPA Savings replica using Downtown MegaKit Source meshes.
 *
 * Repeated kit pieces are InstancedMesh (same path as street furniture).
 * Clone+merge of hundreds of nodes was ~100ms hitch + 3s wall time.
 *
 * Corner of block (0, 0): X = +9, Z = 9–33.
 */

import * as THREE from 'three';
import { loadGltf } from './AssetLoader.js';
import { addInstancedGltfAsync } from './instancing.js';
import { waitIfSlow, waitUntilSmooth, yieldAfterWork } from './yield.js';
import { loadMark } from '../engine/loadLog.js';
import { noCastOpts, castOpts } from './shadowPolicy.js';

const SRC = '/models/downtown/Exports/glTF';

const ASSET_PATHS = {
  firstFloorWindow: `${SRC}/Trim_FirstFloor_Window.gltf`,
  windowColumns:    `${SRC}/Trim_FirstFloor_Window_Columns.gltf`,
  window:           `${SRC}/Trim_Window.gltf`,
  tripleWindow:     `${SRC}/Marble_WindowTriple.gltf`,
  ornament:         `${SRC}/Prop_Ornament_1.gltf`,
  awning:           `${SRC}/Prop_Awning.gltf`,
  bankSign:         `${SRC}/Prop_Sign_Bank.gltf`,
  entranceArch:     `${SRC}/Prop_EntranceArch.gltf`,
  doorFrame:        `${SRC}/DoorFrame_Trim.gltf`,
  door:             `${SRC}/Door_1.gltf`,
  plainWall:        `${SRC}/Trim_Plain_3.gltf`,
  corner:           `${SRC}/Trim_Corner.gltf`,
  columnBottom:     `${SRC}/Trim_Column_Bottom.gltf`,
  columnCenter:     `${SRC}/Trim_Column_Center.gltf`,
  columnTop:        `${SRC}/Trim_Column_Top.gltf`,
  corniceCenter:    `${SRC}/Cornice_Trim_Center.gltf`,
  cornice90L:       `${SRC}/Cornice_Trim_90Angle_L.gltf`,
  roofCornice:      `${SRC}/Roof_SlateCornice_Center.gltf`,
  roofCorner:       `${SRC}/Roof_SlateCornice_Corner.gltf`,
  planter:          `${SRC}/Prop_Planter_Single.gltf`,
  plant:            '/models/nature/Plant_1.gltf'
};

const UPPER_FLOORS = [8, 11, 14, 17, 20, 23];
const bankLambertByHex = new Map();

function bankLambert(material) {
  const hex = material?.color ? material.color.getHex() : 0xc4b8a8;
  if (!bankLambertByHex.has(hex)) {
    bankLambertByHex.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  }
  return bankLambertByHex.get(hex);
}

function useBankLambert(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const next = list.map((m) => bankLambert(m));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

const CAST_KEYS = new Set([
  'plainWall', 'corner',
  'columnBottom', 'columnCenter', 'columnTop',
  'corniceCenter', 'cornice90L', 'roofCornice', 'roofCorner',
  'entranceArch', 'doorFrame', 'door', 'planter'
]);

function emptyPoses() {
  const poses = {};
  for (const key of Object.keys(ASSET_PATHS)) poses[key] = [];
  return poses;
}

function collectPoses() {
  const p = emptyPoses();
  const facadeX = 9.0;
  const frontZ = 9.0;
  const backZ = 33.0;
  const backX = 25.0;
  const rotA = -Math.PI / 2;
  const rotB = Math.PI;
  const entranceZ = 20;

  const add = (key, x, y, z, rot, scale) => {
    p[key].push(scale != null ? { x, y, z, rot, scale } : { x, y, z, rot });
  };

  for (let z = frontZ + 1; z <= backZ - 1; z += 2) {
    const onArch = Math.abs(z - entranceZ) < 3;
    if (z === entranceZ) {
      add('entranceArch', facadeX, 0, z, rotA);
      add('doorFrame', facadeX, 0, z, rotA);
      add('door', facadeX, 0, z, rotA);
    } else if (!onArch) {
      add('firstFloorWindow', facadeX, 0, z, rotA);
      add('windowColumns', facadeX, 0, z, rotA);
    }
    if (!onArch) add('window', facadeX, 3, z, rotA);
    add('corniceCenter', facadeX, 7, z, rotA);
    for (const y of UPPER_FLOORS) add('window', facadeX, y, z, rotA);
    add('roofCornice', facadeX, 26, z, rotA);
  }

  for (let z = frontZ; z <= backZ; z += 4) {
    if (Math.abs(z - entranceZ) < 3) continue;
    add('columnBottom', facadeX - 0.05, 0, z, Math.PI);
    add('columnCenter', facadeX - 0.05, 3, z, Math.PI);
    for (let y = 7; y <= 20; y += 3) add('columnCenter', facadeX - 0.05, y, z, Math.PI);
    add('columnTop', facadeX - 0.05, 23, z, Math.PI);
  }

  for (let x = facadeX + 1; x <= backX - 1; x += 2) {
    add('firstFloorWindow', x, 0, frontZ, rotB);
    add('windowColumns', x, 0, frontZ, rotB);
    add('corniceCenter', x, 7, frontZ, rotB);
    for (const y of UPPER_FLOORS) add('window', x, y, frontZ, rotB);
    add('roofCornice', x, 26, frontZ, rotB);
  }

  for (let x = facadeX + 2; x <= backX - 2; x += 4) {
    add('awning', x, 0, frontZ, rotB);
    add('planter', x, 0, frontZ - 1.55, rotB);
    add('plant', x, 0.58, frontZ - 1.55, rotB + Math.PI * 0.2, 0.85);
    add('tripleWindow', x, 3, frontZ, rotB);
    add('ornament', x, 2.85, frontZ, rotB);
  }

  for (let x = facadeX; x <= backX; x += 4) {
    add('columnBottom', x, 0, frontZ - 0.05, 0);
    add('columnCenter', x, 3, frontZ - 0.05, 0);
    for (let y = 7; y <= 20; y += 3) add('columnCenter', x, y, frontZ - 0.05, 0);
    add('columnTop', x, 23, frontZ - 0.05, 0);
  }

  for (let y = 0; y <= 23; y += 3) add('corner', facadeX, y, frontZ, rotA);
  add('cornice90L', facadeX, 7, frontZ, rotA);
  add('roofCorner', facadeX, 26, frontZ, rotA);

  for (let x = facadeX + 1; x <= backX - 1; x += 2) {
    for (let y = 0; y <= 23; y += 3) add('plainWall', x, y, backZ, 0);
  }
  for (let z = frontZ + 1; z <= backZ - 1; z += 2) {
    for (let y = 0; y <= 23; y += 3) add('plainWall', backX, y, z, Math.PI / 2);
  }

  add('bankSign', (facadeX + backX) / 2, 6.5, frontZ - 0.05, rotB);
  return p;
}

export class BankBuilding {
  async build(parentGroup, physicsWorld, renderer) {
    const tAll = performance.now();
    const poses = collectPoses();
    const bankGroup = new THREE.Group();
    bankGroup.name = 'BankBuilding';

    await waitUntilSmooth(40);
    if (renderer) renderer.pauseDraw();
    parentGroup.add(bankGroup);
    for (const key of Object.keys(ASSET_PATHS)) {
      if (!poses[key].length) continue;
      await waitIfSlow();
      const template = await loadGltf(ASSET_PATHS[key], CAST_KEYS.has(key) ? castOpts() : noCastOpts());
      await yieldAfterWork();
      if (!template) continue;
      useBankLambert(template);
      await addInstancedGltfAsync(
        bankGroup,
        template,
        poses[key],
        CAST_KEYS.has(key) ? castOpts() : noCastOpts()
      );
      if (renderer) await renderer.compileSubtree(bankGroup);
      await yieldAfterWork();
    }
    if (renderer) renderer.resumeDraw();

    if (physicsWorld) {
      physicsWorld.addStaticBox(
        (9 + 25) / 2, 0, (9 + 33) / 2,
        Math.abs(25 - 9) / 2, 14, Math.abs(33 - 9) / 2
      );
    }
    loadMark('bank:total', 'BankBuilding', performance.now() - tAll);
  }
}
