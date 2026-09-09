/**
 * Street-lamp wash layer — Spot/Point pool only lights ground receivers.
 *
 * Buildings / apartment interiors stay on the default layer (0) so night
 * MeshStandard/Physical downtown meshes are not evaluated against 6–8 Spot
 * + Point fills (classic Ultra-night CPU/GPU tax). Sun / moon / hemi stay
 * on layer 0 and still light everything.
 *
 * Camera must enable this layer to *see* wash receivers; lights use set().
 */
export const STREET_WASH_LAYER = 1;

/** Tag a ground / terrain mesh so street Spot+Point can wash it. */
export function enableStreetWash(object3d) {
  if (!object3d?.layers) return object3d;
  object3d.layers.enable(STREET_WASH_LAYER);
  return object3d;
}

/** True for paved receivers that should get night curb/road wash. */
export function isStreetWashReceiver({ castShadow, receiveShadow } = {}) {
  return !!receiveShadow && !castShadow;
}
