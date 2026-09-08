/**
 * Cooperative yields for streaming — NO FPS HOLD / pauseDraw valve.
 * Hard per-frame stream CPU budget (preset budgetMs) PLUS play-frame leftover
 * admission: while interactive, do not start stream work when recent wall
 * frameMs EMA is already >= PLAY_STREAM_HEADROOM_MS (~28ms). Observation-gated
 * yield only — never pauseDraw HOLD / adaptive valve.
 */

import { loadGovernor, PLAY_STREAM_HEADROOM_MS } from "../engine/LoadGovernor.js";
import { getInteractive } from "../engine/loadLog.js";

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

/** Shared stream CPU budget for the current display frame. */
let frameBudgetMark = performance.now();
let frameBudgetSpent = 0;

/** Reset at the start of a display frame (GameLoop) or after a yield. */
export function resetStreamFrameBudget() {
  frameBudgetMark = performance.now();
  frameBudgetSpent = 0;
}

export function noteStreamSpend(ms) {
  if (!(ms > 0)) return;
  frameBudgetSpent += ms;
}

export function streamBudgetRemaining() {
  return Math.max(0, loadGovernor.budgetMs - frameBudgetSpent);
}

export function isStreamBudgetSpent() {
  return frameBudgetSpent >= loadGovernor.budgetMs;
}

/**
 * Interactive leftover gate: recent frames already near the 30fps budget means
 * no more stream CPU this display frame. Boot / pre-interactive always admits.
 */
export function isPlayLeftoverTight() {
  if (!getInteractive()) return false;
  return loadGovernor.frameMsEma >= PLAY_STREAM_HEADROOM_MS;
}

export function isStreamAdmissionClosed() {
  return isStreamBudgetSpent() || isPlayLeftoverTight();
}

/** Attribute wall time since last mark into the shared spend, then yield if over. */
export async function respectStreamBudget() {
  const wall = performance.now() - frameBudgetMark;
  if (wall > frameBudgetSpent) frameBudgetSpent = wall;
  if (!isStreamAdmissionClosed()) return;
  await yieldToMain();
}

export function yieldToMain() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resetStreamFrameBudget();
        resolve();
      });
    });
  });
}

export async function yieldAfterWork() {
  loadGovernor._skip = (loadGovernor._skip || 0) + 1;
  if (loadGovernor._skip % Math.max(1, loadGovernor.yieldEvery) === 0) {
    await yieldToMain();
  } else {
    await respectStreamBudget();
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

/** Shared frame-budget helper — pumps yield when the preset ms are spent. */
export function createBudget() {
  return {
    async tick() {
      await respectStreamBudget();
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
 * Stream admission — hard budgetMs + interactive leftover headroom; never HOLD for FPS.
 */
export async function throughValve(fn) {
  // Spin-yield until this display frame has leftover (or boot). Keeps presenting.
  while (isStreamAdmissionClosed()) {
    await yieldToMain();
  }
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    noteStreamSpend(performance.now() - t0);
    await respectStreamBudget();
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
      noteStreamSpend(spent);
      if (!force && spent < budgetMs && !isStreamAdmissionClosed()) return;
      await yieldToMain();
      start = performance.now();
    }
  };
}

// Re-export pause helpers for compile paths that still pauseDraw explicitly.
export { enterDrawPause, leaveDrawPause };
