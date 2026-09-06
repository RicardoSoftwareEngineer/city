/**
 * Cooperative yields for streaming — NO FPS HOLD / pauseDraw valve.
 * throughValve is pass-through with a light yield after heavy units.
 * hitch HUD still observes frame times elsewhere; this module does not control load.
 */

import { loadGovernor } from '../engine/LoadGovernor.js';

/** Optional draw pause hooks (compileSubtree / legacy). Valve no longer uses them for FPS. */
let drawPauseDepth = 0;
let drawHooks = { pause: null, resume: null };

export function bindValveDraw({ pause, resume }) {
  drawHooks.pause = pause;
  drawHooks.resume = resume;
}

function enterDrawPause() {
  drawPauseDepth += 1;
  if (drawPauseDepth === 1) drawHooks.pause?.();
}

function leaveDrawPause() {
  if (drawPauseDepth <= 0) return;
  drawPauseDepth -= 1;
  if (drawPauseDepth === 0) drawHooks.resume?.();
}

export function yieldToMain() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

export async function yieldAfterWork() {
  loadGovernor._skip = (loadGovernor._skip || 0) + 1;
  if (loadGovernor._skip % Math.max(1, loadGovernor.yieldEvery) === 0) {
    await yieldToMain();
  }
}

/**
 * REMOVED from stream control path. Kept as a no-op so stray callers do not
 * pauseDraw waiting for FPS recovery.
 */
export async function holdForTargetFps(_minFps, _maxFrames) {
  loadGovernor.holding = false;
}

/** Light yield only — never HOLD for FPS. */
export async function waitIfSlow() {
  await yieldToMain();
}

/** No FPS recovery wait. */
export async function waitUntilSmooth(_minFps, _maxFrames) {
  /* intentionally empty */
}

export function createBudget() {
  let start = performance.now();
  return {
    async tick() {
      if (performance.now() - start < loadGovernor.budgetMs) return;
      await yieldToMain();
      start = performance.now();
    }
  };
}

/** @deprecated Valve HOLD deferred — throughValve never HOLDs for FPS. */
let deferValveHoldDepth = 0;

export function pushDeferValveHold() {
  deferValveHoldDepth += 1;
}

export function popDeferValveHold() {
  if (deferValveHoldDepth > 0) deferValveHoldDepth -= 1;
}

export function isValveHoldDeferred() {
  return deferValveHoldDepth > 0;
}

/**
 * Stream admission — pass-through. After a heavy unit, light-yield only.
 * Never pauseDraw / wait for FPS recovery.
 */
export async function throughValve(fn) {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    if (ms >= Math.max(6, loadGovernor.budgetMs)) {
      await yieldToMain();
    }
  }
}

/**
 * Cooperative CPU slice inside a long loop — yield on budget, never HOLD for FPS.
 */
export function createSlice(budgetMs = 3) {
  let start = performance.now();
  return {
    async tick(force = false) {
      const spent = performance.now() - start;
      if (!force && spent < budgetMs) return;
      await yieldToMain();
      start = performance.now();
    }
  };
}

// Re-export pause helpers for compile paths that still pauseDraw explicitly.
export { enterDrawPause, leaveDrawPause };
