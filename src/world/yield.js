import { loadGovernor, TARGET_FPS } from '../engine/LoadGovernor.js';
import { beginLoad, noteGateWait } from '../engine/loadLog.js';

export function yieldToMain() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

export async function yieldAfterWork() {
  if (loadGovernor.needsRest || loadGovernor.level < 2.4) {
    await yieldToMain();
    return;
  }
  loadGovernor._skip = (loadGovernor._skip || 0) + 1;
  if (loadGovernor._skip % loadGovernor.yieldEvery === 0) await yieldToMain();
}

/**
 * Hard gate: pause stream work until FPS ≥ target.
 * Sets loadGovernor.holding so hitch logs / HUD show the pause.
 */
export async function holdForTargetFps(minFps = TARGET_FPS, maxFrames = 180) {
  if (loadGovernor.isSmooth && loadGovernor.instantFps >= minFps) {
    loadGovernor.holding = false;
    return;
  }

  beginLoad('fps-gate', `wait ≥${minFps}`);
  loadGovernor.holding = true;
  const t0 = performance.now();
  let n = 0;
  while (n < maxFrames) {
    const okInstant = loadGovernor.instantFps >= minFps;
    const okEma = loadGovernor.fps >= minFps - 3;
    if (okInstant && okEma) break;
    await yieldToMain();
    n++;
  }
  noteGateWait(performance.now() - t0);
  loadGovernor.holding = false;
}

export async function waitIfSlow() {
  await holdForTargetFps(TARGET_FPS, 180);
}

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
