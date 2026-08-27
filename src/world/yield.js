import { loadGovernor } from '../engine/LoadGovernor.js';

export function yieldToMain() {
  // Two rAFs: one can fire in the same turn as other rAFs queued here
  // (GameLoop + compileSubtree), packing 13 compiles into one hitch
  // (3712ms ring 10 prio 0 +13prog). The second rAF is the next paint.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
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
