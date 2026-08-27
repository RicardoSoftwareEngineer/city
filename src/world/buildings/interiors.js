/**
 * Fake interiors for Source window materials (MI_FakeInterior*).
 * Official prefabs already reference T_lit_interior_*.png.
 * Modular kit pieces only have a grey placeholder — we paint the PNG on.
 * Three.js has no Quaternius interior shader; emission is the stand-in.
 */

import * as THREE from 'three';

const INTERIOR_URLS = [
  '/models/downtown/Exports/glTF/T_lit_interior_1.png',
  '/models/downtown/Exports/glTF/T_lit_interior_2.png'
];

let cachedTextures = null;

function loadTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

export async function loadInteriorTextures() {
  if (cachedTextures) return cachedTextures;
  cachedTextures = await Promise.all(INTERIOR_URLS.map(loadTexture));
  return cachedTextures;
}

function isFakeInterior(material) {
  return typeof material?.name === 'string' && material.name.startsWith('MI_FakeInterior');
}

function decorateInterior(material, fallbackTexture) {
  const map = material.map || fallbackTexture;
  if (!map) return material;
  const cloned = material.clone();
  cloned.map = map;
  cloned.color.set(0xffffff);
  cloned.emissive = new THREE.Color(0x2a2a2a);
  cloned.emissiveMap = map;
  cloned.needsUpdate = true;
  return cloned;
}

export function applyFakeInterior(root, fallbackTexture = null) {
  if (!root) return;
  const decorated = new Map();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const next = list.map((material) => {
      if (!isFakeInterior(material)) return material;
      if (!decorated.has(material.uuid)) {
        decorated.set(material.uuid, decorateInterior(material, fallbackTexture));
      }
      return decorated.get(material.uuid);
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

export async function prepareInteriors(root, textureIndex = 0) {
  const textures = await loadInteriorTextures();
  applyFakeInterior(root, textures[textureIndex] || textures[0]);
}
