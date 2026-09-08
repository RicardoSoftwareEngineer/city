/**
 * High-priority stream personas that temporarily own the shared Valve budget.
 *
 * 1) Apartment live-intent (Interiores Todos / setLiveCount) defers nature + carpet
 *    (prio ≥4) so their compiles cannot freeze the canvas mid-pump.
 * 2) Drive-moving intent: while the car is above a small speed threshold, the same
 *    prio ≥4 lanes are deferred so focus retarget mid-drive cannot dump
 *    multi-second nature compile/reveal into the display frame. Resume when
 *    nearly stopped / parked. Driving smoothness > filling nature poses.
 *
 * Not an FPS HOLD / adaptive valve — cooperative ownership flags only.
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

/**
 * Priorities at or above this are deferred while apartment intent or drive-moving
 * owns the stream. 4 = natureza (base veg), 5 = dense carpet.
 */
export const APARTMENT_DEFER_PRIORITY = 4;
/** Same threshold as apartment — nature + carpet defer while driving. */
export const DRIVE_DEFER_PRIORITY = APARTMENT_DEFER_PRIORITY;

/**
 * Enter/exit hysteresis (m/s). Enter ~4 km/h; exit ~1.4 km/h so brief slowdowns
 * do not thrash nature admission; resume only when nearly stopped / parked.
 */
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

/** True while the car is moving fast enough that nature/carpet must wait. */
export function isDriveMovingActive() {
  return driveMoving;
}

export function getDriveSpeedMps() {
  return driveSpeedMps;
}

/** Nature / carpet should wait (apartment Todos or drive-moving). */
export function shouldDeferLowPrioStream(priority = DRIVE_DEFER_PRIORITY) {
  if (priority < DRIVE_DEFER_PRIORITY) return false;
  return isApartmentLiveIntentActive() || isDriveMovingActive();
}
