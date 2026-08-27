/**
 * PCF on every receiver is the play hitch (~1s CPU, 0 new programs, 600–900 draws).
 * Only the ground samples the shadow map. Volumes write it. Details do neither.
 */

export const VC = { keepVertexColors: true };

/** Asphalt, sidewalks, intersections — building/tree shadows land here. */
export function groundOpts() {
  return { keepVertexColors: true, castShadow: false, receiveShadow: true, useLambert: true };
}

/** Signs, windows, awnings, decals, bank trim. */
export function noCastOpts() {
  return { keepVertexColors: true, castShadow: false, receiveShadow: false };
}

/** Buildings, trees, stairs, fire escapes, planters, poles — occlude, do not sample. */
export function castOpts() {
  return { keepVertexColors: true, castShadow: true, receiveShadow: false };
}
