/**
 * Stream ownership personas + admit policy (single place).
 *
 * Personas temporarily own the shared Valve budget — not an FPS HOLD / adaptive valve.
 *
 * 1) Apartment live-intent — defer nature + carpet (prio ≥4).
 * 2) Drive-moving — only **after** mínimo jogável (playableMin). Then defer
 *    furniture / bank / buildings / nature / carpet (prio ≥1) AND new countryside
 *    **terrain visual meshes** + nature glTF (bushes/trees). Admit only prio 0
 *    streets. Terrain **phys** stays on-demand via ensureGroundAround (outside
 *    this policy). Prefer already-resident meshes / placeholders while moving —
 *    smoothness > filling Fila / vista.
 *
 * Before playableMin: normal boot stream (streets + terrain mesh + enough for
 * the city to appear). Speed hysteresis may latch early; policy stays off until
 * the boot gate so crawl / Começar never freezes downtown black.
 *
 * WorldStream / yield / pumps ask these helpers; do not re-encode thresholds elsewhere.
 *
 * Admit is re-checked per urlJob / terrain tile (and before glTF parse after
 * fetch/yield), not only once at pumpTo entry — otherwise a drive that starts
 * mid-pump still finishes Prop_Sign_* / Bush_* gltf:parse on already-admitted jobs.
 */

import { isPlayableMinReady } from './focusRemain.js';

let apartmentLiveIntentDepth = 0;

export function pushApartmentLiveIntent() {
  apartmentLiveIntentDepth += 1;
}

export function popApartmentLiveIntent() {
  if (apartmentLiveIntentDepth > 0) apartmentLiveIntentDepth -= 1;
}

/** True while ApartmentDirector is pumping a live-interior intent. */
export function isApartmentLiveIntentActive() {
  return apartmentLiveIntentDepth > 0;
}

/** Apartment defers nature (4) + carpet (5). */
export const APARTMENT_DEFER_PRIORITY = 4;

/**
 * Drive-moving defers everything at or above this priority.
 * Only prio 0 streets may run on the ring pump while moving.
 */
export const DRIVE_DEFER_PRIORITY = 1;

/**
 * Named stream lanes for mayAdmitStreamWork (single policy, not scattered flags).
 * Numeric priorities still work; lanes cover work outside the prio ladder
 * (terrain visual mesh bg) and make call sites self-describing.
 */
export const STREAM_LANE = Object.freeze({
  STREETS: 0,
  /** New countryside visual tiles (pumpTerrainSlice). Not phys colliders. */
  TERRAIN_MESH: 'terrainMesh',
  /** Base veg / trees / bushes (prio 4) + treeLod tasks. */
  NATURE: 4,
  CARPET: 5
});

/**
 * Enter/exit hysteresis (m/s). HUD speed = m/s × 3.6 (km/h).
 * Enter ~9 km/h / exit ~2.9 km/h — was 1.2/0.4 (~4.3/1.4 km/h), which latched
 * on crawl near the drive-enter threshold during boot and starved terrainMesh.
 */
export const DRIVE_MOVE_ENTER_MPS = 2.5;
export const DRIVE_MOVE_EXIT_MPS = 0.8;

let driveSpeedMps = 0;
/** Raw speed latch (hysteresis only). Policy uses isDriveMovingActive(). */
let driveMoving = false;

/** Call each play frame with planar chassis speed (m/s). */
export function noteDriveSpeed(mps) {
  const v = Number.isFinite(mps) ? Math.max(0, mps) : 0;
  driveSpeedMps = v;
  if (driveMoving) {
    if (v <= DRIVE_MOVE_EXIT_MPS) driveMoving = false;
  } else if (v >= DRIVE_MOVE_ENTER_MPS) {
    driveMoving = true;
  }
}

/**
 * True when drive-defer policy applies: speed latch AND mínimo jogável.
 * Before playableMin, boot stream admits normally even if the car is rolling.
 */
export function isDriveMovingActive() {
  return driveMoving && isPlayableMinReady();
}

export function getDriveSpeedMps() {
  return driveSpeedMps;
}

// --- Admit policy (one place) -------------------------------------------------

/**
 * Lowest priority that must wait under the active persona.
 * Infinity = nothing deferred. Drive wins when both active (tighter gate).
 */
export function deferredPriorityFloor() {
  if (isDriveMovingActive()) return DRIVE_DEFER_PRIORITY;
  if (isApartmentLiveIntentActive()) return APARTMENT_DEFER_PRIORITY;
  return Number.POSITIVE_INFINITY;
}

/** True if this ring/bg priority must wait for the active persona. */
export function shouldDeferLowPrioStream(priority = DRIVE_DEFER_PRIORITY) {
  return priority >= deferredPriorityFloor();
}

function resolveAdmitPriority(priorityOrLane) {
  if (typeof priorityOrLane === 'number' && Number.isFinite(priorityOrLane)) {
    return priorityOrLane;
  }
  if (priorityOrLane === STREAM_LANE.NATURE || priorityOrLane === 'nature') {
    return 4;
  }
  if (priorityOrLane === STREAM_LANE.CARPET || priorityOrLane === 'carpet') {
    return 5;
  }
  if (priorityOrLane === STREAM_LANE.STREETS || priorityOrLane === 'streets') {
    return 0;
  }
  return 0;
}

/**
 * Single positive admit gate for stream work.
 * @param {number|string} [priorityOrLane=0] ring priority, or STREAM_LANE.* /
 *   'terrainMesh' | 'nature' | 'carpet' | 'streets'
 * Use before starting urlJob/template/task/building/terrain-mesh loads and again
 * after cooperative yields (fetch → parse) so deferred lanes never begin gltf:parse.
 *
 * `terrainMesh`: new visual countryside tiles — deferred while drive-moving only
 * (apartment may still fill vista). Phys colliders are outside this gate.
 */
export function mayAdmitStreamWork(priorityOrLane = 0) {
  if (priorityOrLane === STREAM_LANE.TERRAIN_MESH || priorityOrLane === 'terrainMesh') {
    return !isDriveMovingActive();
  }
  return !shouldDeferLowPrioStream(resolveAdmitPriority(priorityOrLane));
}

/**
 * Clamp ring-pump maxPriority under drive-moving.
 * Drive → at most prio 0 (streets). Apartment does not clamp max (uses defer skip).
 */
export function clampStreamMaxPriority(defaultMax) {
  if (!isDriveMovingActive()) return defaultMax;
  return Math.min(defaultMax, DRIVE_DEFER_PRIORITY - 1);
}

/** While driving, keep pump radius at playCore (no outer annulus dump). */
export function clampStreamLoadRadius(loadR, playCoreR) {
  if (!isDriveMovingActive()) return loadR;
  return Math.min(loadR, playCoreR);
}

/** Outer rings may expand only when not drive-moving. */
export function allowOuterRingExpand() {
  return !isDriveMovingActive();
}

/** Tiny admission while driving (url/template loads, reveal passes, tasks). */
export function driveTinyAdmit() {
  return isDriveMovingActive();
}

/**
 * HUD / personaLog label for the active defer, or null.
 * e.g. "defer prio≥1 (drive moving)"
 */
export function streamDeferDecisionLabel() {
  if (isDriveMovingActive()) {
    return `defer prio≥${DRIVE_DEFER_PRIORITY}+terrainMesh (drive moving)`;
  }
  if (isApartmentLiveIntentActive()) {
    return `defer prio≥${APARTMENT_DEFER_PRIORITY} (apts intent)`;
  }
  return null;
}
