/**
 * Convert FakeInterior + MI_Glass materials to shared transparent glass
 * on the building template before mergeBuilding so all instances get glass.
 *
 * Opacity-based (not transmission) so glass reads without an env map —
 * you can see sky / closed curtains through the pane.
 */

import * as THREE from 'three';

let sharedGlass = null;

export function getWindowGlassMaterial() {
  if (!sharedGlass) {
    sharedGlass = new THREE.MeshPhysicalMaterial({
      name: 'MI_WindowGlass',
      color: 0xc5ddf0,
      metalness: 0.05,
      roughness: 0.12,
      transparent: true,
      opacity: 0.32,
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
