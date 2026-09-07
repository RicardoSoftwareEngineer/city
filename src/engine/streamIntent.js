/**
 * High-priority stream personas that temporarily own the shared Valve budget.
 * Apartment live-intent (Interiores Todos / setLiveCount) defers nature + carpet
 * (prio ≥4) so their pauseDraw compiles cannot freeze the canvas mid-pump.
 *
 * Not an FPS HOLD / adaptive valve — just a cooperative ownership flag.
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
 * Priorities at or above this are deferred while apartment intent owns the stream.
 * 4 = natureza (base veg), 5 = dense carpet.
 */
export const APARTMENT_DEFER_PRIORITY = 4;
