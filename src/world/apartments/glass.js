/**
 * Convert FakeInterior + MI_Glass materials to shared transparent glass
 * on the building template before mergeBuilding so all instances get glass.
 *
 * Opacity-based (not transmission) so glass reads without an env map —
 * you can see sky / closed curtains / lit rooms through the pane.
 *
 * Also strips MegaKit MI_InteriorWall / MI_InteriorFloor shell meshes that
 * sit behind FakeInterior and would otherwise darken the view through glass.
 */

import * as THREE from 'three';

let sharedGlass = null;

export function getWindowGlassMaterial() {
  if (!sharedGlass) {
    sharedGlass = new THREE.MeshPhysicalMaterial({
      name: 'MI_WindowGlass',
      color: 0xd8e8f4,
      metalness: 0.02,
      roughness: 0.18,
      transparent: true,
      // Slightly clearer than 0.14 so room emissive reads through outdoor glare.
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }
  return sharedGlass;
}

function isWindowMat(material) {
  const name = material?.name;
  if (typeof name !== 'string') return false;
  return name.startsWith('MI_FakeInterior') || name === 'MI_Glass';
}

function isInteriorShellMat(material) {
  const name = material?.name;
  return name === 'MI_InteriorWall' || name === 'MI_InteriorFloor';
}

/**
 * Remove MegaKit interior shell meshes (opaque wall/floor behind windows)
 * so clear glass shows our on-demand room template instead of the dark kit.
 */
export function stripKitInteriorShell(root) {
  if (!root) return;
  const toRemove = [];
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    if (list.some(isInteriorShellMat)) toRemove.push(child);
  });
  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
  }
}

/**
 * Replace FakeInterior / MI_Glass with transparent glass on `root` (mutates).
 */
export function applyWindowGlass(root) {
  if (!root) return;
  const glass = getWindowGlassMaterial();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const next = list.map((material) => (isWindowMat(material) ? glass : material));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}
