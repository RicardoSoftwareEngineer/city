/**
 * Compact 3D-ish compass HUD — CSS disc with N/S/L/O (Portuguese).
 * Rose rotates from camera forward yaw on XZ; red needle = look direction.
 * Hidden in boot-idle via CSS (same pattern as #day-night-float).
 */

import * as THREE from 'three';

const _dir = new THREE.Vector3();

/**
 * @param {THREE.Camera} camera
 * @returns {{ update: () => void }}
 */
export function bindCompassHud(camera) {
  const root = document.getElementById('compass-hud');
  const rose = document.getElementById('compass-rose');
  const degEl = document.getElementById('compass-deg');
  if (!root || !rose || !camera) {
    return { update() {} };
  }

  function update() {
    camera.getWorldDirection(_dir);
    // World −Z = Norte (Three.js default look). Heading clockwise from N.
    const headingRad = Math.atan2(_dir.x, -_dir.z);
    const headingDeg = ((THREE.MathUtils.radToDeg(headingRad) % 360) + 360) % 360;
    // Rotate rose opposite to heading so N stays world-aligned; needle fixed up.
    rose.style.transform = `rotate(${-headingDeg}deg)`;
    if (degEl) degEl.textContent = `${Math.round(headingDeg)}°`;
  }

  update();
  return { update };
}
