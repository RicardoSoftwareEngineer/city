/**
 * Assembles one building Group from a spec + the shared kit.
 */

import * as THREE from 'three';
import { addPiece } from './kit.js';
import { buildingSize } from './specs.js';

const FACE_FRONT = Math.PI;
const FACE_BACK = 0;
const FACE_RIGHT = Math.PI / 2;
const FACE_LEFT = -Math.PI / 2;

function bayCenters(bays) {
  const xs = [];
  for (let i = 0; i < bays; i++) xs.push(-bays + 1 + i * 2);
  return xs;
}

function cornicePiece(kit, kind) {
  if (kind === 'brick') return kit.corniceBrick;
  if (kind === 'metal') return kit.corniceMetal;
  return kit.corniceTrim;
}

export function assembleBuilding(spec, kit) {
  const group = new THREE.Group();
  group.name = spec.name;
  group.userData.specId = spec.id;

  const { width, depth, height } = buildingSize(spec);
  const xLeft = -width / 2;
  const xRight = width / 2;
  const zBack = depth;
  const xs = bayCenters(spec.bays);
  const zs = bayCenters(spec.depth).map((z) => z + depth / 2);
  const roofY = spec.floors * 3;
  const corniceY = roofY - 3;
  const midBay = xs[Math.floor(xs.length / 2)];

  for (const x of xs) {
    const isDoor = spec.entrance && x === midBay;

    if (isDoor) {
      addPiece(group, kit.entrance, x, 0, 0, FACE_FRONT);
      addPiece(group, kit.doorFrame, x, 0, 0, FACE_FRONT);
      addPiece(group, kit.door, x, 0, 0, FACE_FRONT);
    } else if (spec.ground === 'wall') {
      addPiece(group, kit.groundWall, x, 0, 0, FACE_FRONT);
    } else {
      addPiece(group, kit.shopWindow, x, 0, 0, FACE_FRONT);
      addPiece(group, kit.shopColumns, x, 0, 0, FACE_FRONT);
    }

    for (let floor = 1; floor < spec.floors; floor++) {
      addPiece(group, kit.window, x, floor * 3, 0, FACE_FRONT);
    }

    addPiece(group, cornicePiece(kit, spec.cornice), x, corniceY, 0, FACE_FRONT);
    addPiece(group, kit.roofCenter, x, roofY, 0, FACE_FRONT);
  }

  if (spec.columns) {
    for (let x = xLeft; x <= xRight; x += 4) {
      addPiece(group, kit.columnBottom, x, 0, -0.05, FACE_BACK);
      for (let floor = 1; floor < spec.floors; floor++) {
        addPiece(group, kit.columnCenter, x, floor * 3, -0.05, FACE_BACK);
      }
      addPiece(group, kit.columnTop, x, (spec.floors - 1) * 3, -0.05, FACE_BACK);
    }
  }

  for (const x of xs) {
    for (let floor = 0; floor < spec.floors; floor++) {
      addPiece(group, kit.plainWall, x, floor * 3, zBack, FACE_BACK);
    }
    addPiece(group, kit.roofCenter, x, roofY, zBack, FACE_BACK);
  }

  for (const z of zs) {
    for (let floor = 0; floor < spec.floors; floor++) {
      addPiece(group, kit.plainWall, xLeft, floor * 3, z, FACE_LEFT);
      addPiece(group, kit.plainWall, xRight, floor * 3, z, FACE_RIGHT);
    }
  }

  for (let floor = 0; floor < spec.floors; floor++) {
    const y = floor * 3;
    addPiece(group, kit.corner, xLeft, y, 0, FACE_FRONT);
    addPiece(group, kit.corner, xRight, y, 0, FACE_RIGHT);
  }
  addPiece(group, kit.cornice90, xLeft, corniceY, 0, FACE_FRONT);
  addPiece(group, kit.roofCorner, xLeft, roofY, 0, FACE_FRONT);

  group.userData.collider = {
    width,
    depth,
    height,
    centerZ: depth / 2
  };
  return group;
}
