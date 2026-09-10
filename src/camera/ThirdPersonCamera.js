/**
 * ThirdPersonCamera — two modes:
 *   'follow' — centered on the car (drag orbit; fixed zoomDistance — no wheel zoom)
 *   'orbit'  — free flight: WASD + LMB look + RMB pan (XZ strafe + Y elevate), car input disabled
 *
 * Mouse wheel never zooms or changes fly-speed (staging owns wheel near catalog).
 * Toggle with the on-screen button or the C key.
 */

import * as THREE from 'three';

const LABEL = {
  follow: 'Câmera: no carro',
  orbit: 'Câmera: voo livre'
};

const UI_BLOCK = '#hud, button, #terrain-debug-readout, #play-hitch-hud';
/** m/s at street level — was 110 (teleports when FPS dips). */
const BASE_SPEED = 22;
const FAST_MULT = 2.6;
const SLOW_MULT = 0.35;
const LOOK_SENS = 0.0045;
/** Higher = snappier look; still smooth at 60–240 FPS. */
const LOOK_SMOOTH = 18;
/** Move accel toward wish (1/s). Higher = snappier, lower = glide. */
const MOVE_SMOOTH = 10;
/** Clamp hitch frames so one bad delta cannot jump tens of meters. */
const MAX_FLY_DT = 1 / 30;
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
    this._velocity = new THREE.Vector3();

    // Free-flight look: target angles from input, displayed angles lerp each frame
    // (movementX + exponential smoothing — common FPS/Three.js pattern; avoids
    // the stepped “10px” feel of raw clientX deltas applied instantly).
    this.flyYaw = 0;
    this.flyPitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;
    this.flySpeed = BASE_SPEED;
    this._dragging = false;
    this._panning = false;
    this._lookBlocked = false;
    this._pointerId = null;
    this._panPointerId = null;
    this._panRight = new THREE.Vector3();
    this._panForward = new THREE.Vector3();
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
    let button = document.getElementById('camera-mode-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'camera-mode-btn';
      button.type = 'button';
      document.body.appendChild(button);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMode();
    });
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

  /**
   * While true, free-flight / follow look-drag is suppressed (furniture staging).
   * Clears any in-progress look drag immediately so apt sandbox can use scroll
   * for furniture height / catalog cycle.
   */
  setLookBlocked(blocked) {
    this._lookBlocked = !!blocked;
    if (this._lookBlocked) {
      this._dragging = false;
      this._endPan();
      if (this._pointerId != null && this._dom) {
        try {
          this._dom.releasePointerCapture(this._pointerId);
        } catch (_) {
          /* ignore */
        }
        this._pointerId = null;
      }
      // Also mute follow-mode MouseInput for this gesture.
      if (this._mouseInput) this._mouseInput.enabled = false;
    } else if (this.mode === 'follow') {
      this._setCarMouseEnabled(true);
    } else {
      this._setCarMouseEnabled(false);
    }
  }

  /** End RMB pan and release capture if held. */
  _endPan() {
    this._panning = false;
    if (this._panPointerId != null && this._dom) {
      try {
        this._dom.releasePointerCapture(this._panPointerId);
      } catch (_) {
        /* ignore */
      }
      this._panPointerId = null;
    }
  }

  /**
   * Translate free-flight camera from screen deltas (no look rotation).
   * Horizontal: XZ strafe along look-right. Vertical: world Y elevate.
   * Drag right → world slides with cursor (camera moves left).
   * Drag down → camera raises on world Y.
   */
  _applyPanDelta(dx, dy) {
    if (!dx && !dy) return;
    this.camera.getWorldDirection(this._forward);
    this._panForward.set(this._forward.x, 0, this._forward.z);
    if (this._panForward.lengthSq() < 1e-8) {
      this._panForward.set(0, 0, -1);
    } else {
      this._panForward.normalize();
    }
    this._panRight.crossVectors(this._panForward, this._up).normalize();
    const sens = Math.max(0.012, Math.abs(this.camera.position.y) * 0.0014 + 0.008);
    this.camera.position.addScaledVector(this._panRight, -dx * sens);
    this.camera.position.addScaledVector(this._up, dy * sens);
    this.orbitControls.target
      .copy(this.camera.position)
      .addScaledVector(this._forward, 12);
  }

  _setCarMouseEnabled(on) {
    if (this._mouseInput) this._mouseInput.enabled = on;
  }

  _bindFlyMouse(dom) {
    this._onDown = (event) => {
      if (this._lookBlocked) return;
      if (this.mode !== 'orbit') return;
      if (event.target.closest?.(UI_BLOCK)) return;
      // RMB — pan: XZ strafe + world-Y elevate (no look rotation).
      if (event.button === 2) {
        this._endPan();
        this._dragging = false;
        this._panning = true;
        this._panPointerId = event.pointerId;
        try {
          dom.setPointerCapture(event.pointerId);
        } catch (_) { /* older browsers */ }
        event.preventDefault();
        return;
      }
      if (event.button !== 0) return;
      if (this._panning) return;
      this._dragging = true;
      this._pointerId = event.pointerId;
      try {
        dom.setPointerCapture(event.pointerId);
      } catch (_) { /* older browsers */ }
      event.preventDefault();
    };
    this._onMove = (event) => {
      if (this._lookBlocked) return;
      if (this.mode !== 'orbit') return;
      let dx = event.movementX;
      let dy = event.movementY;
      if (dx == null || dy == null) {
        dx = 0;
        dy = 0;
      }
      if (this._panning) {
        this._applyPanDelta(dx, dy);
        return;
      }
      if (!this._dragging) return;
      // movementX/Y are sub-pixel capable and match PointerLockControls’ input path.
      this._targetYaw -= dx * LOOK_SENS;
      this._targetPitch -= dy * LOOK_SENS;
      this._targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this._targetPitch));
    };
    this._onUp = (event) => {
      if (this._panning && (event.button == null || event.button === 2 || event.type === 'pointercancel')) {
        this._endPan();
      }
      if (!this._dragging) return;
      if (event.button != null && event.button !== 0 && event.type !== 'pointercancel') return;
      this._dragging = false;
      if (this._pointerId != null) {
        try {
          dom.releasePointerCapture(this._pointerId);
        } catch (_) { /* ignore */ }
        this._pointerId = null;
      }
    };
    this._onContextMenu = (event) => {
      // Keep RMB for pan — suppress browser menu on the canvas.
      event.preventDefault();
    };
    // pointer* events give movementX reliably while captured.
    // No wheel listener — flySpeed stays at BASE_SPEED (Shift/Ctrl still multiply).
    dom.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('contextmenu', this._onContextMenu);
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
    const dt = Math.min(Math.max(delta, 0), MAX_FLY_DT);
    // Exponential smoothing toward target look — frame-rate independent.
    const lookT = 1 - Math.exp(-LOOK_SMOOTH * dt);
    this.flyYaw += (this._targetYaw - this.flyYaw) * lookT;
    this.flyPitch += (this._targetPitch - this.flyPitch) * lookT;
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

    let speed = this.flySpeed;
    if (kb.isPressed('ShiftLeft') || kb.isPressed('ShiftRight')) speed *= FAST_MULT;
    if (kb.isPressed('AltLeft') || kb.isPressed('AltRight')) speed *= SLOW_MULT;
    // Mild altitude boost only (old y/10 capped at 40× made hitch frames teleport).
    const altitudeScale = Math.min(2.2, Math.max(0.7, 0.85 + this.camera.position.y / 80));
    speed *= altitudeScale;

    if (this._wish.lengthSq() > 0) this._wish.normalize().multiplyScalar(speed);
    else this._wish.set(0, 0, 0);

    const moveT = 1 - Math.exp(-MOVE_SMOOTH * dt);
    this._velocity.lerp(this._wish, moveT);
    this.camera.position.addScaledVector(this._velocity, dt);

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
