/**
 * Adaptive load throttle. GameLoop reports frame time; the streamer
 * spends more or less CPU so FPS stays near TARGET_FPS (~45) while loading.
 *
 * All knobs read `level` (0–4). HUD shows loadPercent = level/4*100.
 */

import { noteHitch, setGovernorSnap } from './loadLog.js';
import { noteDecision } from './personaLog.js';

export const TARGET_FPS = 60;

let _lastHitchNote = 0;
let _lastLevelNoted = -1;
let _lastLevelNoteAt = 0;

export const loadGovernor = {
  fps: 60,
  instantFps: 60,
  /** 0 = crawl, 4 = sprint */
  level: 2.5,
  /** While true, knobs cannot sprint (EMA FPS between hitches was hitting batch 32). */
  streaming: false,
  /** True while holdForTargetFps is waiting (B1 scheduler hold). */
  holding: false,
  /** Temporary quality ladder label from qualityAdapter. */
  quality: 'full',

  noteFrame(deltaSeconds) {
    const fps = 1 / Math.max(deltaSeconds, 1 / 240);
    this.instantFps = fps;
    this.fps = this.fps * 0.88 + fps * 0.12;

    // Log any frame under ~58 fps (TARGET 60). Missed spikes were hiding between 50–58.
    if (deltaSeconds > 1 / (TARGET_FPS - 2)) {
      this.level = Math.max(0, this.level - 1.2);
      this._snap();
      noteHitch(deltaSeconds * 1000);
      const now = performance.now();
      if (now - _lastHitchNote > 400) {
        noteDecision('LoadGovernor', `hitch ${Math.round(deltaSeconds * 1000)}ms`);
        _lastHitchNote = now;
      }
      return;
    }

    const climb = this.streaming ? 0.015 : 0.045;
    const error = this.fps - TARGET_FPS;
    this.level += error * climb;
    if (this.level < 0) this.level = 0;
    if (this.level > 4) this.level = 4;
    // B1: while streaming, never sprint — max level 1.5 (~ few ms budget).
    if (this.streaming && this.level > 1.5) this.level = 1.5;
    if (this.holding) this.level = Math.min(this.level, 0.5);
    const lvl = Math.round(this.level * 2) / 2;
    const now = performance.now();
    if (lvl !== _lastLevelNoted && now - _lastLevelNoteAt > 1500) {
      noteDecision('LoadGovernor', `level ${lvl}`);
      _lastLevelNoted = lvl;
      _lastLevelNoteAt = now;
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

  /** 0–100 for HUD */
  get loadPercent() {
    return Math.round((this.level / 4) * 100);
  },

  /** CPU ms of stream work before yielding to a frame */
  get budgetMs() {
    const ms = 1.5 + (this.level / 4) * 10.5;
    // B1: ≤4ms CPU slices while the world is streaming under FPS gate.
    return this.streaming ? Math.min(ms, 4) : ms;
  },

  get chunk() {
    let n = 32;
    if (this.level < 0.6) n = 1;
    else if (this.level < 1.4) n = 3;
    else if (this.level < 2.2) n = 8;
    else if (this.level < 3.2) n = 16;
    return this.streaming ? Math.min(n, 4) : n;
  },

  get instanceBatch() {
    let n = 32;
    if (this.level < 0.7) n = 4;
    else if (this.level < 1.5) n = 8;
    else if (this.level < 2.4) n = 16;
    else if (this.level < 3.3) n = 24;
    return this.streaming ? Math.min(n, 4) : n;
  },

  /** Yield every N merged geometries */
  get mergeStride() {
    if (this.level < 1) return 2;
    if (this.level < 2.5) return 6;
    return 14;
  },

  /** Yield every N frames of work when FPS is high (1 = always yield) */
  get yieldEvery() {
    if (this.streaming) return 1;
    if (this.level < 1.2) return 1;
    if (this.level < 2.4) return 1;
    if (this.level < 3.2) return 2;
    return 3;
  },

  /** True while we should not start more stream CPU (below target FPS). */
  get needsRest() {
    return this.instantFps < TARGET_FPS || this.fps < TARGET_FPS - 5 || this.level < 0.8;
  },

  /** Soft: EMA recovered enough to resume after a pause. */
  get isSmooth() {
    return this.instantFps >= TARGET_FPS && this.fps >= TARGET_FPS - 3;
  }
};
