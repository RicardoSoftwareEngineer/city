import { loadGovernor, TARGET_FPS } from '../engine/LoadGovernor.js';
import { beginLoad, loadMark, noteGateWait } from '../engine/loadLog.js';
import { noteDecision } from '../engine/personaLog.js';

/** Optional: pause GameLoop draw while the valve is closed (keeps last frame). */
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
  if (loadGovernor.instantFps >= minFps && loadGovernor.fps >= minFps - 3) {
    loadGovernor.holding = false;
    return;
  }

  // Pause draw FIRST — otherwise each "wait" frame still renders 4–16M tris
  // and the gate wait itself shows up as multi-second Travamentos (HOLD + draw3s).
  beginLoad('fps-gate', `wait ≥${minFps}`);
  loadGovernor.holding = true;
  noteDecision('Valve', 'HOLD open');
  enterDrawPause();
  // EMA stays poisoned after a hitch and used to block the stream for tens of
  // seconds on slower machines (Windows) while the box recovered. Snap EMA up
  // toward instant so HOLD exits once real frames are healthy again.
  loadGovernor.fps = Math.max(loadGovernor.fps, Math.min(loadGovernor.instantFps, minFps));
  const t0 = performance.now();
  let n = 0;
  let okStreak = 0;
  const needStreak = 3;
  // Hard wall-clock cap — never strand the loader (was ~38s on Windows).
  const maxMs = Math.min(2500, maxFrames * 20);
  try {
    while (n < maxFrames && performance.now() - t0 < maxMs) {
      const okInstant = loadGovernor.instantFps >= minFps * 0.9;
      if (okInstant) {
        okStreak += 1;
        // Pull EMA toward target while paused so we do not wait forever.
        loadGovernor.fps = loadGovernor.fps * 0.7 + Math.max(loadGovernor.instantFps, minFps) * 0.3;
        if (okStreak >= needStreak) break;
      } else {
        okStreak = 0;
      }
      await yieldToMain();
      n++;
    }
  } finally {
    const waited = performance.now() - t0;
    noteGateWait(waited);
    loadMark('fps-gate', `wait ≥${minFps}`, waited);
    leaveDrawPause();
    loadGovernor.holding = false;
    noteDecision('Valve', 'HOLD close');
  }
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

/**
 * Single admission gate for streaming work ("porteira").
 * Opens only when FPS is at target; after a heavy unit, closes until FPS recovers.
 * All stream jobs should run through this — not only waitIfSlow beforehand.
 */
export async function throughValve(fn) {
  await holdForTargetFps(TARGET_FPS, 180);
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    const heavy = ms >= Math.max(6, loadGovernor.budgetMs);
    if (heavy || loadGovernor.needsRest || loadGovernor.instantFps < TARGET_FPS) {
      await holdForTargetFps(TARGET_FPS, 180);
    }
  }
}

/**
 * Cooperative CPU slice inside a long loop (terrain verts, etc.).
 * Yields + re-gates when the slice budget is spent or FPS is already low.
 */
export function createSlice(budgetMs = 3) {
  let start = performance.now();
  return {
    async tick(force = false) {
      const spent = performance.now() - start;
      if (!force && spent < budgetMs && !loadGovernor.needsRest) return;
      if (loadGovernor.needsRest || loadGovernor.instantFps < TARGET_FPS) {
        await holdForTargetFps(TARGET_FPS, 60);
      } else {
        await yieldToMain();
      }
      start = performance.now();
    }
  };
}
