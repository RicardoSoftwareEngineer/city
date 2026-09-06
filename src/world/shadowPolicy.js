/**
 * PCF on every receiver is the play hitch (~1s CPU, 0 new programs, 600–900 draws).
 * Only the ground samples the shadow map. Volumes write it. Details do neither.
 *
 * MegaKit Downtown bakes pure-red COLOR_0 (US curb / wear). Product look strips
 * that on paved + buildings (menos é mais). Nature foliage still keeps VC.
 */

export const VC = { keepVertexColors: true };

/**
 * Paved ground (asphalt, intersections, sidewalks) — receive shadows, no COLOR_0.
 */
export function groundOpts() {
  return { keepVertexColors: false, castShadow: false, receiveShadow: true };
}

/** Alias for sidewalk call sites. */
export function sidewalkOpts() {
  return groundOpts();
}

/** Signs, windows, awnings, decals, bank trim — no kit red VC. */
export function noCastOpts() {
  return { keepVertexColors: false, castShadow: false, receiveShadow: false };
}

/** Downtown volumes (buildings, planters, poles) — cast, no kit red VC. */
export function castOpts() {
  return { keepVertexColors: false, castShadow: true, receiveShadow: false };
}

/** Nature foliage — leaf tint needs COLOR_0. */
export function foliageOpts() {
  return { keepVertexColors: true, castShadow: true, receiveShadow: false };
}
