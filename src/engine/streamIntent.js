/**
 * Stream ownership personas + admit policy (single place).
 *
 * Personas temporarily own the shared Valve budget — not an FPS HOLD / adaptive valve.
 *
 * 1) Apartment live-intent — defer nature + carpet (prio ≥4).
 * 2) Drive-moving — defer furniture / bank / buildings / nature / carpet (prio ≥1).
 *    Admit only prio 0 streets (+ terrain on its independent background pump).
 *    Blocks mid-drive Prop_Sign_* gltf:parse hitches. Smoothness > filling Fila.
 *
 * WorldStream / yield / pumps ask these helpers; do not re-encode thresholds elsewhere.
 */

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
 * Only prio 0 streets (+ terrain bg) may run while moving.
 */
export const DRIVE_DEFER_PRIORITY = 1;

/** Enter/exit hysteresis (m/s): ~4 km/h enter / ~1.4 km/h exit. */
export const DRIVE_MOVE_ENTER_MPS = 1.2;
export const DRIVE_MOVE_EXIT_MPS = 0.4;

let driveSpeedMps = 0;
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

export function isDriveMovingActive() {
  return driveMoving;
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
    return `defer prio≥${DRIVE_DEFER_PRIORITY} (drive moving)`;
  }
  if (isApartmentLiveIntentActive()) {
    return `defer prio≥${APARTMENT_DEFER_PRIORITY} (apts intent)`;
  }
  return null;
}
