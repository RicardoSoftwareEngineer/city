import { loadGovernor, TARGET_FPS } from '../engine/LoadGovernor.js';
import { beginLoad } from '../engine/loadLog.js';

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
 * Hard gate: pause ALL stream work until FPS is back at/above target.
 * Load wall-clock can stretch; play frames must stay near 60.
 */
export async function holdForTargetFps(minFps = TARGET_FPS, maxFrames = 180) {
  if (loadGovernor.isSmooth && loadGovernor.instantFps >= minFps) return;

  beginLoad('fps-gate', `wait ≥${minFps}`);
  let n = 0;
  while (n < maxFrames) {
    const okInstant = loadGovernor.instantFps >= minFps;
    const okEma = loadGovernor.fps >= minFps - 3;
    if (okInstant && okEma) break;
    await yieldToMain();
    n++;
  }
}

/** Before each stream slice: do not proceed while under target FPS. */
export async function waitIfSlow() {
  await holdForTargetFps(TARGET_FPS, 180);
}

/** Wait until FPS is back near the target before a heavy merge/GPU spike. */
export async function waitUntilSmooth(minFps = TARGET_FPS, maxFrames = 120) {
  await holdForTargetFps(minFps, maxFrames);
}

export function createBudget() {
  let start = performance.now();
  return {
    async tick() {
      if (loadGovernor.needsRest) {
        await holdForTargetFps(TARGET_FPS, 60);
        start = performance.now();
        return;
      }
      if (performance.now() - start < loadGovernor.budgetMs) return;
      await yieldToMain();
      start = performance.now();
    }
  };
}
