/**
 * MouseInput — Tracks LMB drag (for camera orbit).
 * RMB is left to ThirdPersonCamera for XZ pan.
 *
 * Provides:
 *   .yaw / .pitch   — accumulated orbit angles from dragging
 *   .zoomDistance    — fixed follow-camera distance (not changed by wheel)
 *
 * Ignores drags that start on HUD or UI buttons.
 * Mouse wheel never zooms — staging uses wheel for catalog cycle / furniture height.
 */

import { pitchLimits, zoomLimits } from '../camera/cameraLimits.js';

const UI_BLOCK = '#hud, button, #terrain-debug-readout';

export class MouseInput {
  constructor() {
    const pitch = pitchLimits();
    const zoom = zoomLimits();
    this.yaw = 0;
    this.pitch = 0.16;
    this.zoomDistance = 6.2;
    this.minZoom = zoom.min;
    this.maxZoom = zoom.max; // may be Infinity
    this.minPitch = pitch.min;
    this.maxPitch = pitch.max;

    this.enabled = true;
    this.isDragging = false;
    this.previousX = 0;
    this.previousY = 0;

    this.handleMouseDown = (event) => {
      if (!this.enabled) return;
      // LMB only — RMB is reserved for camera pan (ThirdPersonCamera).
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest(UI_BLOCK)) return;
      this.isDragging = true;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
    };

    this.handleMouseMove = (event) => {
      if (!this.enabled || !this.isDragging) return;
      const deltaX = event.clientX - this.previousX;
      const deltaY = event.clientY - this.previousY;
      this.previousX = event.clientX;
      this.previousY = event.clientY;

      const sensitivity = 0.01;
      this.yaw -= deltaX * sensitivity;
      this.pitch += deltaY * sensitivity;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    };

    this.handleMouseUp = () => {
      this.isDragging = false;
    };

    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  /** Staging / UI: cancel look drag. */
  setDragBlocked(blocked) {
    if (blocked) this.isDragging = false;
  }

  applyState(camera) {
    if (!camera) return;
    if (Number.isFinite(camera.yaw)) this.yaw = camera.yaw;
    if (Number.isFinite(camera.pitch)) {
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, camera.pitch));
    }
    if (Number.isFinite(camera.zoom)) {
      this.zoomDistance = Math.max(this.minZoom, camera.zoom);
      if (Number.isFinite(this.maxZoom)) {
        this.zoomDistance = Math.min(this.maxZoom, this.zoomDistance);
      }
    }
  }

  dispose() {
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }
}
