/**
 * Terrain mesh / collider debug view (button on screen, or key M).
 *
 * Three modes, cycled by the button:
 *   off       — normal game
 *   malha     — terrain painted as wireframe + collider tile borders
 *   colisores — terrain mesh hidden, only the collider borders remain
 *
 * The borders are drawn from the tiles that actually have a Cannon Heightfield
 * right now, so you literally watch them appear as you drive (they are built
 * on demand under the car). The readout says whether the tile under the car
 * has a collider — that is how a fall-through spot gets identified.
 */

import * as THREE from 'three';
import { setTerrainWireframe } from './splatMaterial.js';
import {
  builtTiles,
  tileAt,
  hasTile,
  terrainBodyCount,
  PAVED_MIN,
  PAVED_MAX
} from './terrainCollision.js';
import { surfaceY } from './paths.js';

const MODES = ['off', 'malha', 'colisores'];
const LABEL = {
  off: 'Malha: oculta',
  malha: 'Malha: pintada',
  colisores: 'Malha: só colisores'
};

const NEAR_COLOR = new THREE.Color(0x39ff88);
const FAR_COLOR = new THREE.Color(0xffb03a);
const PAVED_COLOR = new THREE.Color(0x4aa3ff);
const LIFT = 0.12;

function makeButton(onClick) {
  const button = document.createElement('button');
  button.id = 'terrain-debug-btn';
  button.textContent = LABEL.off;
  button.addEventListener('click', onClick);
  document.body.appendChild(button);
  return button;
}

function makeReadout() {
  const box = document.createElement('div');
  box.id = 'terrain-debug-readout';
  document.body.appendChild(box);
  return box;
}

/** Border ring of one tile, sampled along the real surface. */
function pushTileBorder(positions, colors, tile, color) {
  const step = tile.size / tile.segs;
  const corners = [];
  for (let i = 0; i < tile.segs; i++) corners.push([tile.x0 + i * step, tile.z0]);
  for (let i = 0; i < tile.segs; i++) corners.push([tile.x0 + tile.size, tile.z0 + i * step]);
  for (let i = tile.segs; i > 0; i--) corners.push([tile.x0 + i * step, tile.z0 + tile.size]);
  for (let i = tile.segs; i > 0; i--) corners.push([tile.x0, tile.z0 + i * step]);

  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    positions.push(a[0], surfaceY(a[0], a[1]) + LIFT, a[1]);
    positions.push(b[0], surfaceY(b[0], b[1]) + LIFT, b[1]);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
}

/** Flat rectangle marking the paved rect the terrain deliberately skips. */
function pushPavedRect(positions, colors) {
  const y = 0.2;
  const ring = [
    [PAVED_MIN, PAVED_MIN], [PAVED_MAX, PAVED_MIN],
    [PAVED_MAX, PAVED_MAX], [PAVED_MIN, PAVED_MAX]
  ];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    positions.push(a[0], y, a[1], b[0], y, b[1]);
    for (let k = 0; k < 2; k++) {
      colors.push(PAVED_COLOR.r, PAVED_COLOR.g, PAVED_COLOR.b);
    }
  }
}

export function initTerrainDebug({ scene, getCarPosition }) {
  let modeIndex = 0;
  let shownBodies = -1;
  let lines = null;
  let readoutAt = 0;

  const overlay = new THREE.Group();
  overlay.name = 'terrainDebugOverlay';
  overlay.visible = false;
  scene.add(overlay);

  const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true });

  const rebuild = () => {
    if (lines) {
      overlay.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
    const positions = [];
    const colors = [];
    for (const tile of builtTiles()) {
      pushTileBorder(positions, colors, tile, tile.far ? FAR_COLOR : NEAR_COLOR);
    }
    pushPavedRect(positions, colors);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    overlay.add(lines);
    shownBodies = terrainBodyCount();
  };

  const terrainGroups = () => {
    const found = [];
    scene.traverse((node) => {
      if (node.name === 'terrain') found.push(node);
    });
    return found;
  };

  const applyMode = () => {
    const mode = MODES[modeIndex];
    setTerrainWireframe(mode === 'malha');
    for (const group of terrainGroups()) group.visible = mode !== 'colisores';
    overlay.visible = mode !== 'off';
    button.textContent = LABEL[mode];
    button.dataset.mode = mode;
    readout.style.display = mode === 'off' ? 'none' : 'block';
    if (overlay.visible && shownBodies !== terrainBodyCount()) rebuild();
  };

  const cycle = () => {
    modeIndex = (modeIndex + 1) % MODES.length;
    applyMode();
  };

  const button = makeButton(cycle);
  const readout = makeReadout();
  window.addEventListener('keydown', (event) => {
    if (event.key === 'm' || event.key === 'M') cycle();
  });

  return function tickTerrainDebug(elapsed) {
    if (MODES[modeIndex] === 'off') return;

    if (shownBodies !== terrainBodyCount()) rebuild();
    if (elapsed - readoutAt < 0.2) return;
    readoutAt = elapsed;

    const car = getCarPosition();
    const tile = tileAt(car.x, car.z);
    const ground = surfaceY(car.x, car.z);
    const where = tile
      ? `${tile.size}m @ ${tile.x0},${tile.z0} ${hasTile(tile) ? '✔ colisor' : '✖ SEM colisor'}`
      : 'piso da cidade (sem heightfield)';

    readout.innerHTML = [
      `<b>colisores:</b> ${terrainBodyCount()} tiles`,
      `<b>carro:</b> ${car.x.toFixed(0)}, ${car.z.toFixed(0)}`,
      `<b>tile:</b> ${where}`,
      `<b>solo:</b> ${ground.toFixed(2)} m · carro y ${car.y.toFixed(2)} m`,
      '<span class="tdk"><i style="background:#39ff88"></i>40 m perto</span>' +
      '<span class="tdk"><i style="background:#ffb03a"></i>80 m longe</span>' +
      '<span class="tdk"><i style="background:#4aa3ff"></i>cidade (box plano)</span>'
    ].join('<br>');
  };
}
