/**
 * LoadGovernor — fixed stream knobs from the active quality preset.
 *
 * FPS is still measured for hitch HUD diagnostics only. There is NO live
 * level climb/shrink from frame times, and no stream throttle driven by FPS.
 * Hardware determines actual frame rate (commercial Ultra / Simples model).
 */

import { noteHitch, setGovernorSnap } from './loadLog.js';
import { getActivePreset } from './qualityPresets.js';

/** Hitch HUD threshold only — not a stream control target. */
export const TARGET_FPS = 60;

export const loadGovernor = {
  fps: 60,
  instantFps: 60,
  /** While true, HUD shows streaming; knobs stay preset-fixed. */
  streaming: false,
  /** Legacy flag — Valve no longer HOLDs for FPS; always false on the stream path. */
  holding: false,
  /** Active preset label (Ultra / Simples). */
  quality: 'Ultra',

  noteFrame(deltaSeconds) {
    const fps = 1 / Math.max(deltaSeconds, 1 / 240);
    this.instantFps = fps;
    this.fps = this.fps * 0.88 + fps * 0.12;

    // Observation only — Travamentos list. Do not drive load / radius / valve.
    if (deltaSeconds > 1 / (TARGET_FPS - 2)) {
      noteHitch(deltaSeconds * 1000);
    }
    this._snap();
  },

  _snap() {
    setGovernorSnap({
      carga: this.loadPercent,
      batch: this.instanceBatch,
      streaming: this.streaming,
      holding: this.holding,
      quality: this.quality
    });
  },

  /** HUD: Ultra shows full "carga" capacity; Simples shows a lower fixed bar. */
  get loadPercent() {
    return getActivePreset().id === 'ultra' ? 100 : 40;
  },

  /** Hard stream CPU ms per display frame while playing (preset; shared frame budget). */
  get budgetMs() {
    return getActivePreset().budgetMs;
  },

  get chunk() {
    return getActivePreset().chunk;
  },

  get instanceBatch() {
    return getActivePreset().instanceBatch;
  },

  get mergeStride() {
    return getActivePreset().mergeStride;
  },

  get yieldEvery() {
    return getActivePreset().yieldEvery;
  },

  /**
   * Compat for callers that still read `level` (e.g. merge yield stride).
   * Ultra ≈ 4, Simples ≈ 1.5 — fixed, never climbs from FPS.
   */
  get level() {
    return getActivePreset().id === 'ultra' ? 4 : 1.5;
  },

  /** Never rest for FPS — stream path must not pauseDraw / HOLD. */
  get needsRest() {
    return false;
  },

  /** Always true — no FPS recovery gate. */
  get isSmooth() {
    return true;
  }
};
