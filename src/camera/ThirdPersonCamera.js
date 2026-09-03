/**
 * ThirdPersonCamera — two modes:
 *   'follow' — centered on the car (drag orbit + scroll zoom)
 *   'orbit'  — free flight: WASD + mouse look, car input disabled
 *
 * Toggle with the on-screen button or the C key.
 */

import * as THREE from 'three';

const LABEL = {
  follow: 'Câmera: no carro',
  orbit: 'Câmera: voo livre'
};

const UI_BLOCK = '#hud, button, #terrain-debug-readout, #play-hitch-hud';
const BASE_SPEED = 38;
const FAST_MULT = 3.2;
const SLOW_MULT = 0.35;
const LOOK_SENS = 0.005;
const MIN_PITCH = -Math.PI / 2 + 0.04;
const MAX_PITCH = Math.PI / 2 - 0.04;

export class ThirdPersonCamera {
  constructor(camera, renderer, keyboard) {
    this.camera = camera;
    this.keyboard = keyboard;
    this.mode = 'follow';
    this._lookAt = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._wish = new THREE.Vector3();

    // Free-flight look (yaw around world Y, pitch around local X).
    this.flyYaw = 0;
    this.flyPitch = 0;
    this.flySpeed = BASE_SPEED;
    this._dragging = false;
    this._prevX = 0;
    this._prevY = 0;
    this._lastTarget = null;

    // Kept so SessionState can still read a target vector when saving.
    this.orbitControls = {
      target: new THREE.Vector3(),
      enabled: false,
      update() {}
    };

    this._button = this._makeButton();
    this._syncButton();
    this._bindFlyMouse(renderer.domElement);

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyC') return;
      if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      this.toggleMode();
    });
  }

  /** True while free-flying — callers should ignore car WASD. */
  get isFreeFlight() {
    return this.mode === 'orbit';
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

  _bindFlyMouse(dom) {
    this._onDown = (event) => {
      if (this.mode !== 'orbit') return;
      if (event.target.closest?.(UI_BLOCK)) return;
      this._dragging = true;
      this._prevX = event.clientX;
      this._prevY = event.clientY;
    };
    this._onMove = (event) => {
      if (this.mode !== 'orbit' || !this._dragging) return;
      const dx = event.clientX - this._prevX;
      const dy = event.clientY - this._prevY;
      this._prevX = event.clientX;
      this._prevY = event.clientY;
      this.flyYaw -= dx * LOOK_SENS;
      this.flyPitch -= dy * LOOK_SENS;
      this.flyPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.flyPitch));
      this._applyFlyLook();
    };
    this._onUp = () => {
      this._dragging = false;
    };
    this._onWheel = (event) => {
      if (this.mode !== 'orbit') return;
      if (event.target.closest?.(UI_BLOCK)) return;
      // Wheel nudges fly speed (not zoom-to-point).
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      this.flySpeed = Math.max(4, Math.min(220, this.flySpeed * factor));
      event.preventDefault();
    };
    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _syncFlyFromCamera() {
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    e.setFromQuaternion(this.camera.quaternion);
    this.flyYaw = e.y;
    this.flyPitch = e.x;
    this._applyFlyLook();
  }

  _applyFlyLook() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.flyYaw;
    this.camera.rotation.x = this.flyPitch;
    this.camera.rotation.z = 0;
  }

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
      // Keep current camera pose; seed look from it.
      this._syncFlyFromCamera();
      if (target) {
        this.orbitControls.target.set(
          target.position.x,
          target.position.y + 0.8,
          target.position.z
        );
      } else {
        this.camera.getWorldDirection(this._forward);
        this.orbitControls.target
          .copy(this.camera.position)
          .addScaledVector(this._forward, 12);
      }
      this._dragging = false;
    }

    this.mode = next;
    this._syncButton();
  }

  applyState(cameraState, target, mouse) {
    if (!cameraState) return;
    const mode = cameraState.mode === 'orbit' ? 'orbit' : 'follow';

    if (mode === 'orbit' && Number.isFinite(cameraState.x)) {
      this.camera.position.set(cameraState.x, cameraState.y, cameraState.z);
      if (Number.isFinite(cameraState.tx)) {
        this.orbitControls.target.set(cameraState.tx, cameraState.ty, cameraState.tz);
      }
      this.mode = 'orbit';
      this._syncFlyFromCamera();
      this._syncButton();
      return;
    }

    this.mode = 'follow';
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

  _updateFreeFlight(delta) {
    this._applyFlyLook();
    this.camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this._up).normalize();

    this._wish.set(0, 0, 0);
    const kb = this.keyboard;
    if (kb.isPressed('KeyW') || kb.isPressed('ArrowUp')) this._wish.add(this._forward);
    if (kb.isPressed('KeyS') || kb.isPressed('ArrowDown')) this._wish.sub(this._forward);
    if (kb.isPressed('KeyD') || kb.isPressed('ArrowRight')) this._wish.add(this._right);
    if (kb.isPressed('KeyA') || kb.isPressed('ArrowLeft')) this._wish.sub(this._right);
    if (kb.isPressed('KeyE') || kb.isPressed('Space')) this._wish.y += 1;
    if (kb.isPressed('KeyQ') || kb.isPressed('ControlLeft') || kb.isPressed('ControlRight')) {
      this._wish.y -= 1;
    }

    if (this._wish.lengthSq() > 0) {
      this._wish.normalize();
      let speed = this.flySpeed;
      if (kb.isPressed('ShiftLeft') || kb.isPressed('ShiftRight')) speed *= FAST_MULT;
      if (kb.isPressed('AltLeft') || kb.isPressed('AltRight')) speed *= SLOW_MULT;
      this.camera.position.addScaledVector(this._wish, speed * delta);
    }

    // Keep a look-ahead point for session save.
    this.orbitControls.target
      .copy(this.camera.position)
      .addScaledVector(this._forward, 12);
  }

  update(target, mouse, delta = 1 / 60) {
    if (target) this._lastTarget = target;
    if (this.mode === 'follow' && target) {
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

    this._updateFreeFlight(delta);
  }
}
