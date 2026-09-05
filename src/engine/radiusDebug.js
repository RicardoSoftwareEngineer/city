/**
 * Debug rings for MemoryGuardian residency radius:
 * cyan = inner 0.1R (full quality intent), magenta = outer R.
 */

import * as THREE from 'three';
import { memoryGuardian } from './memoryGuardian.js';

const SEGMENTS = 96;
const RING_Y = 0.2;

function makeUnitLoop(color) {
  const positions = new Float32Array((SEGMENTS + 1) * 3);
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    positions[i * 3] = Math.cos(a);
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    transparent: true,
    opacity: 0.9
  });
  const loop = new THREE.LineLoop(geo, mat);
  loop.frustumCulled = false;
  return loop;
}

/**
 * @param {THREE.Scene} scene
 * @returns {(car: { x: number, z: number }) => void}
 */
export function initRadiusDebug(scene) {
  const group = new THREE.Group();
  group.name = 'radiusDebugRings';
  group.visible = false;
  scene.add(group);

  const inner = makeUnitLoop(0x22d3ee); // cyan
  const outer = makeUnitLoop(0xe879f9); // magenta
  group.add(inner);
  group.add(outer);

  const btn = document.getElementById('radius-rings-btn');
  const syncBtn = () => {
    if (!btn) return;
    btn.dataset.on = group.visible ? '1' : '0';
    btn.setAttribute('aria-pressed', group.visible ? 'true' : 'false');
    btn.textContent = group.visible ? 'Anéis do raio: on' : 'Anéis do raio';
  };
  syncBtn();
  if (btn) {
    btn.addEventListener('click', () => {
      group.visible = !group.visible;
      syncBtn();
    });
  }

  return function tickRadiusDebug(/* car */) {
    if (!group.visible) return;
    const { x, z } = memoryGuardian.focus;
    const R = Math.max(memoryGuardian.radius, 1);
    const rIn = Math.max(memoryGuardian.innerRadius, 0.5);
    group.position.set(x, RING_Y, z);
    inner.scale.set(rIn, 1, rIn);
    outer.scale.set(R, 1, R);
  };
}
