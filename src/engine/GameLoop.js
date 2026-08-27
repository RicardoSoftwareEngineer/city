/**
 * GameLoop — Drives the requestAnimationFrame loop.
 *
 * Calls a single `onTick(deltaSeconds, elapsedSeconds)` callback each frame.
 * Clamps delta to 100 ms to prevent physics explosions after tab-away.
 */

import * as THREE from 'three';
import { loadGovernor } from './LoadGovernor.js';

export class GameLoop {
  constructor(onTick) {
    this.clock = new THREE.Clock();
    this.onTick = onTick;
    this.animate = this.animate.bind(this);
  }

  start() {
    this.clock.start();
    requestAnimationFrame(this.animate);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const rawDelta = this.clock.getDelta();
    loadGovernor.noteFrame(rawDelta);
    const delta = Math.min(rawDelta, 0.1);
    const elapsed = this.clock.getElapsedTime();

    this.onTick(delta, elapsed);
  }
}
