/**
 * MouseInput — Tracks mouse drag (for camera orbit) and scroll (for zoom).
 *
 * Provides:
 *   .yaw / .pitch   — accumulated orbit angles from dragging
 *   .zoomDistance    — current zoom level from scroll wheel
 *
 * Ignores drags / wheel that start on HUD or UI buttons.
 * Zoom has a tiny floor only — no upper limit.
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

    this.isDragging = false;
    this.previousX = 0;
    this.previousY = 0;

    this.handleMouseDown = (event) => {
      if (event.target.closest(UI_BLOCK)) return;
      this.isDragging = true;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
    };

    this.handleMouseMove = (event) => {
      if (!this.isDragging) return;
      const deltaX = event.clientX - this.previousX;
      const deltaY = event.clientY - this.previousY;
      this.previousX = event.clientX;
      this.previousY = event.clientY;

      const sensitivity = 0.005;
      this.yaw -= deltaX * sensitivity;
      this.pitch += deltaY * sensitivity;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    };

    this.handleMouseUp = () => {
      this.isDragging = false;
    };

    this.handleWheel = (event) => {
      if (event.target.closest(UI_BLOCK)) return;
      this.zoomDistance += event.deltaY * 0.035;
      if (this.zoomDistance < this.minZoom) this.zoomDistance = this.minZoom;
      if (Number.isFinite(this.maxZoom) && this.zoomDistance > this.maxZoom) {
        this.zoomDistance = this.maxZoom;
      }
      event.preventDefault();
    };

    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel, { passive: false });
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
    window.removeEventListener('wheel', this.handleWheel);
  }
}
