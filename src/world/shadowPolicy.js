/**
 * PCF on every receiver is the play hitch (~1s CPU, 0 new programs, 600–900 draws).
 * Only the ground samples the shadow map. Volumes write it. Details do neither.
 */

export const VC = { keepVertexColors: true };

/**
 * Paved ground (asphalt, intersections, sidewalks) — receive shadows, no COLOR_0.
 * MegaKit bakes pure-red curb verts (US no-parking) on streets + sidewalks;
 * product look strips that kit paint (menos é mais).
 */
export function groundOpts() {
  return { keepVertexColors: false, castShadow: false, receiveShadow: true };
}

/** Alias — same policy as ground (kept for CityGrid sidewalk call sites). */
export function sidewalkOpts() {
  return groundOpts();
}

/** Signs, windows, awnings, decals, bank trim. */
export function noCastOpts() {
  return { keepVertexColors: true, castShadow: false, receiveShadow: false };
}

/** Buildings, trees, stairs, fire escapes, planters, poles — occlude, do not sample. */
export function castOpts() {
  return { keepVertexColors: true, castShadow: true, receiveShadow: false };
}
