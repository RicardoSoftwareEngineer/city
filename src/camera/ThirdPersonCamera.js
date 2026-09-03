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
const BASE_SPEED = 110;
const FAST_MULT = 3.8;
const SLOW_MULT = 0.35;
const LOOK_SENS = 0.0045;
/** Higher = snappier look; still smooth at 60–240 FPS. */
const LOOK_SMOOTH = 18;
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

    // Free-flight look: target angles from input, displayed angles lerp each frame
    // (movementX + exponential smoothing — common FPS/Three.js pattern; avoids
    // the stepped “10px” feel of raw clientX deltas applied instantly).
    this.flyYaw = 0;
    this.flyPitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;
    this.flySpeed = BASE_SPEED;
    this._dragging = false;
    this._pointerId = null;
    this._dom = renderer.domElement;
    this._lastTarget = null;
    this._mouseInput = null;

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

  /** Optional MouseInput — disabled while flying so two look systems never fight. */
  setMouseInput(mouse) {
    this._mouseInput = mouse;
  }

  _setCarMouseEnabled(on) {
    if (this._mouseInput) this._mouseInput.enabled = on;
  }

  _bindFlyMouse(dom) {
    this._onDown = (event) => {
      if (this.mode !== 'orbit') return;
      if (event.button !== 0) return;
      if (event.target.closest?.(UI_BLOCK)) return;
      this._dragging = true;
      this._pointerId = event.pointerId;
      try {
        dom.setPointerCapture(event.pointerId);
      } catch (_) { /* older browsers */ }
      event.preventDefault();
    };
    this._onMove = (event) => {
      if (this.mode !== 'orbit' || !this._dragging) return;
      // movementX/Y are sub-pixel capable and match PointerLockControls’ input path.
      let dx = event.movementX;
      let dy = event.movementY;
      if (dx == null || dy == null) {
        dx = 0;
        dy = 0;
      }
      this._targetYaw -= dx * LOOK_SENS;
      this._targetPitch -= dy * LOOK_SENS;
      this._targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this._targetPitch));
    };
    this._onUp = (event) => {
      if (!this._dragging) return;
      this._dragging = false;
      if (this._pointerId != null) {
        try {
          dom.releasePointerCapture(this._pointerId);
        } catch (_) { /* ignore */ }
        this._pointerId = null;
      }
    };
    this._onWheel = (event) => {
      if (this.mode !== 'orbit') return;
      if (event.target.closest?.(UI_BLOCK)) return;
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      this.flySpeed = Math.max(8, Math.min(420, this.flySpeed * factor));
      event.preventDefault();
    };
    // pointer* events give movementX reliably while captured.
    dom.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _syncFlyFromCamera() {
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    e.setFromQuaternion(this.camera.quaternion);
    this.flyYaw = e.y;
    this.flyPitch = e.x;
    this._targetYaw = e.y;
    this._targetPitch = e.x;
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
      this._setCarMouseEnabled(false);
    } else {
      this._setCarMouseEnabled(true);
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
      this._setCarMouseEnabled(false);
      this._syncButton();
      return;
    }

    this.mode = 'follow';
    this._setCarMouseEnabled(true);
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
    // Exponential smoothing toward target look — frame-rate independent.
    const t = 1 - Math.exp(-LOOK_SMOOTH * Math.max(delta, 0));
    this.flyYaw += (this._targetYaw - this.flyYaw) * t;
    this.flyPitch += (this._targetPitch - this.flyPitch) * t;
    this._applyFlyLook();

    this.camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this._up).normalize();

    const kb = this.keyboard;
    // WASD = move relative to look (CS spectator freecam): A/D strafe, not turn.
    this._wish.set(0, 0, 0);
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
      // Spectator-style: the higher the camera, the faster it flies.
      // ~1× near street level (y≈10), scales up with altitude, soft cap.
      const altitudeScale = Math.min(40, Math.max(0.45, this.camera.position.y / 10));
      speed *= altitudeScale;
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
