/**
 * ThirdPersonCamera — Follows a target (the car) with smooth interpolation.
 *
 * Supports two modes:
 *   'follow' — orbits behind the car, controlled by MouseInput yaw/pitch/zoom
 *   'orbit'  — free OrbitControls (for debug/inspection)
 *
 * Toggle modes with the 'C' key.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEV_FREE_CAMERA, DEV_ZOOM_MAX, DEV_ZOOM_MIN } from './cameraLimits.js';

export class ThirdPersonCamera {
  constructor(camera, renderer, keyboard) {
    this.camera = camera;
    this.keyboard = keyboard;
    this.mode = 'follow';

    this.orbitControls = new OrbitControls(camera, renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    if (DEV_FREE_CAMERA) {
      this.orbitControls.minPolarAngle = 0;
      this.orbitControls.maxPolarAngle = Math.PI;
      this.orbitControls.minDistance = DEV_ZOOM_MIN;
      this.orbitControls.maxDistance = DEV_ZOOM_MAX;
    } else {
      this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.02;
    }
    this.orbitControls.enabled = false;

    // Listen for camera toggle
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyC') {
        this.mode = this.mode === 'follow' ? 'orbit' : 'follow';
      }
    });
  }

  /**
   * Update camera each frame.
   * @param {THREE.Object3D} target — the chassis mesh to follow
   * @param {import('../input/MouseInput.js').MouseInput} mouse — mouse state
   */
  applyState(cameraState, target, mouse) {
    if (!cameraState) return;
    this.mode = cameraState.mode === 'orbit' ? 'orbit' : 'follow';

    if (this.mode === 'orbit' && Number.isFinite(cameraState.x)) {
      this.camera.position.set(cameraState.x, cameraState.y, cameraState.z);
      this.orbitControls.target.set(cameraState.tx, cameraState.ty, cameraState.tz);
      this.orbitControls.update();
      return;
    }

    if (target && mouse) this.snapFollow(target, mouse);
  }

  snapFollow(target, mouse) {
    const carPosition = target.position;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(target.quaternion);

    const totalYaw = euler.y + mouse.yaw;
    const offsetX = Math.sin(totalYaw) * Math.cos(mouse.pitch) * mouse.zoomDistance;
    const offsetZ = Math.cos(totalYaw) * Math.cos(mouse.pitch) * mouse.zoomDistance;
    const offsetY = Math.sin(mouse.pitch) * mouse.zoomDistance + 1.2;

    this.camera.position.set(
      carPosition.x - offsetX,
      carPosition.y + offsetY,
      carPosition.z - offsetZ
    );
    this.camera.lookAt(carPosition.x, carPosition.y + 0.8, carPosition.z);
  }

  update(target, mouse) {
    if (this.mode === 'follow' && target) {
      this.orbitControls.enabled = false;

      const carPosition = target.position;
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(target.quaternion);

      const totalYaw = euler.y + mouse.yaw;
      const offsetX = Math.sin(totalYaw) * Math.cos(mouse.pitch) * mouse.zoomDistance;
      const offsetZ = Math.cos(totalYaw) * Math.cos(mouse.pitch) * mouse.zoomDistance;
      const offsetY = Math.sin(mouse.pitch) * mouse.zoomDistance + 1.2;

      const targetCameraPosition = new THREE.Vector3(
        carPosition.x - offsetX,
        carPosition.y + offsetY,
        carPosition.z - offsetZ
      );

      this.camera.position.lerp(targetCameraPosition, 0.14);
      this.camera.lookAt(carPosition.x, carPosition.y + 0.8, carPosition.z);
    } else {
      this.orbitControls.enabled = true;
      if (target) {
        this.orbitControls.target.set(target.position.x, target.position.y + 0.8, target.position.z);
      }
      this.orbitControls.update();
    }
  }
}
