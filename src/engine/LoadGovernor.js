/**
 * LoadGovernor — fixed stream knobs from the active quality preset.
 *
 * FPS / frameMs are measured for hitch HUD and for leftover stream admission
 * (yield when recent frames are already tight). There is NO live level
 * climb/shrink and no pauseDraw HOLD from FPS.
 * Hardware determines actual frame rate (commercial Ultra / Simples model).
 */

import { noteHitch, setGovernorSnap } from './loadLog.js';
import { getActivePreset } from './qualityPresets.js';

/** Hitch HUD threshold only — not a stream control target. */
export const TARGET_FPS = 60;

/**
 * Play-frame leftover gate (spec 03): admit stream work only when recent wall
 * frames leave headroom for ≤~33ms total. Observation-gated — never pauseDraw HOLD.
 */
export const PLAY_FRAME_TARGET_MS = 33;
/** Prefer stream spend only when recent frameMs is under this. */
export const PLAY_STREAM_HEADROOM_MS = 28;

export const loadGovernor = {
  fps: 60,
  instantFps: 60,
  /** Last display-frame wall time (ms) from GameLoop delta. */
  lastFrameMs: 16.7,
  /** EMA of wall frame ms — leftover admission reads this. */
  frameMsEma: 16.7,
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
    const frameMs = deltaSeconds * 1000;
    this.lastFrameMs = frameMs;
    this.frameMsEma = this.frameMsEma * 0.85 + frameMs * 0.15;

    // Observation only — Travamentos list. Do not drive load / radius / valve HOLD.
    if (deltaSeconds > 1 / (TARGET_FPS - 2)) {
      noteHitch(frameMs);
    }
    this._snap();
  },

  /**
   * True when interactive play should allow stream CPU this frame.
   * Uses observed frame ms (not pauseDraw). Boot / non-interactive always open.
   */
  get streamAdmissionOpen() {
    // Imported lazily via getter callers that already know interactive — yield.js checks.
    return this.frameMsEma < PLAY_STREAM_HEADROOM_MS;
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
