/**
 * Adaptive load throttle. GameLoop reports frame time; the streamer
 * spends more or less CPU so FPS stays near TARGET_FPS (~45) while loading.
 *
 * All knobs read `level` (0–4). HUD shows loadPercent = level/4*100.
 */

import { noteHitch, setGovernorSnap } from './loadLog.js';

export const TARGET_FPS = 45;

export const loadGovernor = {
  fps: 60,
  instantFps: 60,
  /** 0 = crawl, 4 = sprint */
  level: 2.5,
  /** While true, knobs cannot sprint (EMA FPS between hitches was hitting batch 32). */
  streaming: false,

  noteFrame(deltaSeconds) {
    const fps = 1 / Math.max(deltaSeconds, 1 / 240);
    this.instantFps = fps;
    this.fps = this.fps * 0.88 + fps * 0.12;

    if (deltaSeconds > 1 / 24) {
      setGovernorSnap({ carga: this.loadPercent, batch: this.instanceBatch });
      this.level = Math.max(0, this.level - 1.2);
      noteHitch(deltaSeconds * 1000);
      return;
    }

    const climb = this.streaming ? 0.015 : 0.045;
    const error = this.fps - TARGET_FPS;
    this.level += error * climb;
    if (this.level < 0) this.level = 0;
    if (this.level > 4) this.level = 4;
    if (this.streaming && this.level > 2) this.level = 2;
    setGovernorSnap({ carga: this.loadPercent, batch: this.instanceBatch });
  },

  /** 0–100 for HUD */
  get loadPercent() {
    return Math.round((this.level / 4) * 100);
  },

  /** CPU ms of stream work before yielding to a frame */
  get budgetMs() {
    const ms = 1.5 + (this.level / 4) * 10.5;
    return this.streaming ? Math.min(ms, 6) : ms;
  },

  get chunk() {
    let n = 32;
    if (this.level < 0.6) n = 1;
    else if (this.level < 1.4) n = 3;
    else if (this.level < 2.2) n = 8;
    else if (this.level < 3.2) n = 16;
    return this.streaming ? Math.min(n, 8) : n;
  },

  get instanceBatch() {
    let n = 32;
    if (this.level < 0.7) n = 4;
    else if (this.level < 1.5) n = 8;
    else if (this.level < 2.4) n = 16;
    else if (this.level < 3.3) n = 24;
    return this.streaming ? Math.min(n, 8) : n;
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

  get needsRest() {
    return this.fps < 30 || this.level < 0.8;
  }
};
