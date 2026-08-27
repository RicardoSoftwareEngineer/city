/**
 * KeyboardInput — Tracks which keys are currently held down.
 *
 * Usage:
 *   const keyboard = new KeyboardInput();
 *   if (keyboard.isPressed('KeyW')) { ... }
 */

export class KeyboardInput {
  constructor() {
    this.keys = {};

    this.handleKeyDown = (event) => { this.keys[event.code] = true; };
    this.handleKeyUp   = (event) => { this.keys[event.code] = false; };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  isPressed(code) {
    return !!this.keys[code];
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}
