/**
 * Downtown street lamps — Quaternius/CC0 GLB instanced along N–S streets.
 * Poses only here; night glow + capped PointLights live in StreetLightsController.
 */

/** Raw GLB height ≈ 93.2 units → ~6 m poles on the sidewalk. */
export const STREETLIGHT_RAW_HEIGHT = 93.236;
export const STREETLIGHT_TARGET_HEIGHT = 6;
export const STREETLIGHT_SCALE = STREETLIGHT_TARGET_HEIGHT / STREETLIGHT_RAW_HEIGHT;

export const STREETLIGHT_URL = '/models/street/lamp_post.glb';

/** Shared bulb materials (filled by prepareStreetlightTemplate). */
const bulbMaterials = [];

export function getStreetlightBulbMaterials() {
  return bulbMaterials;
}

/**
 * Mid-block poles on both curbs of each N–S grid street.
 * Long axis of the GLB faces the roadway (±X).
 */
export function collectStreetlightPoses(xs, zs) {
  const poses = [];
  const s = STREETLIGHT_SCALE;
  for (const sx of xs) {
    for (let j = 0; j < zs.length - 1; j++) {
      const z = (zs[j] + zs[j + 1]) / 2;
      poses.push({ x: sx - 8.5, z, rot: 0, scale: s });
      poses.push({ x: sx + 8.5, z, rot: Math.PI, scale: s });
    }
  }
  return poses;
}

/**
 * Tag emissive Inners mats for night toggle; poles cast cheap shadows.
 * Called once via urlJob options.prepare after GLTF load.
 */
export function prepareStreetlightTemplate(root) {
  bulbMaterials.length = 0;
  if (!root) return;
  root.name = root.name || 'streetlight';
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = false;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat?.isMaterial) continue;
      const em = mat.emissive;
      const glowing =
        (em && (em.r > 0.04 || em.g > 0.04 || em.b > 0.04)) ||
        /inner|bulb|lamp|emissive|light/i.test(`${mat.name || ''} ${child.name || ''}`);
      if (!glowing) continue;
      mat.userData._streetBulb = true;
      mat.userData._streetBulbMaxEi =
        typeof mat.emissiveIntensity === 'number' && mat.emissiveIntensity > 0
          ? mat.emissiveIntensity
          : 1.25;
      mat.emissiveIntensity = 0;
      bulbMaterials.push(mat);
    }
  });
}
