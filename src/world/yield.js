import { loadGovernor } from '../engine/LoadGovernor.js';

export function yieldToMain() {
  // Always rAF. scheduler.yield() in Chrome returns before the next paint,
  // so compileSubtree + waitIfSlow packed 8 GL programs into one GameLoop
  // frame (6880ms ring 10 prio 2 +8prog).
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Yield more when FPS is low; skip some yields when FPS is comfortably high.
 */
export async function yieldAfterWork() {
  if (loadGovernor.needsRest || loadGovernor.level < 2.4) {
    await yieldToMain();
    return;
  }
  loadGovernor._skip = (loadGovernor._skip || 0) + 1;
  if (loadGovernor._skip % loadGovernor.yieldEvery === 0) await yieldToMain();
}

/**
 * If the last frames dropped under ~30 FPS, wait until the loop recovers.
 */
export async function waitIfSlow() {
  let n = 0;
  while (loadGovernor.needsRest && n < 12) {
    await yieldToMain();
    n++;
  }
}

/** Wait until FPS is back near the target before a heavy merge/GPU spike. */
export async function waitUntilSmooth(minFps = 42, maxFrames = 48) {
  let n = 0;
  while (loadGovernor.fps < minFps && n < maxFrames) {
    await yieldToMain();
    n++;
  }
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
