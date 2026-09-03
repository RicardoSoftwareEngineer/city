/**
 * ThirdPersonCamera — two modes:
 *   'follow' — centered on the car (drag orbit + scroll zoom)
 *   'orbit'  — free flight (OrbitControls with pan; target not locked to car)
 *
 * Toggle with the on-screen button or the C key.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEV_FREE_CAMERA, DEV_ZOOM_MIN } from './cameraLimits.js';

const LABEL = {
  follow: 'Câmera: no carro',
  orbit: 'Câmera: voo livre'
};

export class ThirdPersonCamera {
  constructor(camera, renderer, keyboard) {
    this.camera = camera;
    this.keyboard = keyboard;
    this.mode = 'follow';
    this._lookAt = new THREE.Vector3();

    this.orbitControls = new OrbitControls(camera, renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.enablePan = true;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.minDistance = DEV_ZOOM_MIN;
    // No upper zoom / distance ceiling.
    this.orbitControls.maxDistance = Infinity;
    if (DEV_FREE_CAMERA) {
      this.orbitControls.minPolarAngle = 0;
      this.orbitControls.maxPolarAngle = Math.PI;
    } else {
      this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.02;
    }
    this.orbitControls.enabled = false;

    this._button = this._makeButton();
    this._syncButton();

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyC') return;
      if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      this.toggleMode();
    });
  }

  _makeButton() {
    const button = document.createElement('button');
    button.id = 'camera-mode-btn';
    button.type = 'button';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMode();
    });
    document.body.appendChild(button);
    return button;
  }

  _syncButton() {
    if (!this._button) return;
    this._button.textContent = LABEL[this.mode] || LABEL.follow;
    this._button.dataset.mode = this.mode;
  }

  /** Switch follow ↔ free flight. Seeds free-flight target from the car once. */
  toggleMode(target = null) {
    this.setMode(this.mode === 'follow' ? 'orbit' : 'follow', target || this._lastTarget);
  }

  setMode(mode, target = null) {
    const next = mode === 'orbit' ? 'orbit' : 'follow';
    if (next === this.mode) {
      this._syncButton();
      return;
    }

    if (next === 'orbit') {
      // Seed the orbit pivot in front of / at the car, then leave it alone
      // so pan + zoom become true free flight.
      if (target) {
        this.orbitControls.target.set(
          target.position.x,
          target.position.y + 0.8,
          target.position.z
        );
      } else {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        this.orbitControls.target
          .copy(this.camera.position)
          .addScaledVector(dir, 12);
      }
      this.orbitControls.enabled = true;
      this.orbitControls.update();
    } else {
      this.orbitControls.enabled = false;
    }

    this.mode = next;
    this._syncButton();
  }

  /**
   * Restore saved camera. Free-flight pose uses x/y/z + target tx/ty/tz.
   */
  applyState(cameraState, target, mouse) {
    if (!cameraState) return;
    const mode = cameraState.mode === 'orbit' ? 'orbit' : 'follow';

    if (mode === 'orbit' && Number.isFinite(cameraState.x)) {
      this.camera.position.set(cameraState.x, cameraState.y, cameraState.z);
      if (Number.isFinite(cameraState.tx)) {
        this.orbitControls.target.set(cameraState.tx, cameraState.ty, cameraState.tz);
      } else if (target) {
        this.orbitControls.target.set(
          target.position.x,
          target.position.y + 0.8,
          target.position.z
        );
      }
      this.mode = 'orbit';
      this.orbitControls.enabled = true;
      this.orbitControls.update();
      this._syncButton();
      return;
    }

    this.mode = 'follow';
    this.orbitControls.enabled = false;
    this._syncButton();
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
    if (target) this._lastTarget = target;
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
      this._lookAt.set(carPosition.x, carPosition.y + 0.8, carPosition.z);
      this.camera.lookAt(this._lookAt);
      return;
    }

    // Free flight: do NOT re-lock the orbit target to the car.
    this.orbitControls.enabled = true;
    this.orbitControls.update();
  }
}
