/**
 * Follow/orbit limits.
 * Zoom has no practical ceiling — free flight and follow can go as far as needed.
 * DEV_FREE_CAMERA still unlocks pitch through the ground for inspection.
 */

export const DEV_FREE_CAMERA = true;

export const PLAY_PITCH_MIN = 0.05;
export const PLAY_PITCH_MAX = Math.PI / 2.2;
export const PLAY_ZOOM_MIN = 4.0;
/** No upper zoom limit (Infinity). Kept as a named export for OrbitControls. */
export const PLAY_ZOOM_MAX = Infinity;

export const DEV_PITCH_LIMIT = Math.PI / 2 - 0.02;
export const DEV_ZOOM_MIN = 0.4;
export const DEV_ZOOM_MAX = Infinity;

export function pitchLimits() {
  if (DEV_FREE_CAMERA) return { min: -DEV_PITCH_LIMIT, max: DEV_PITCH_LIMIT };
  return { min: PLAY_PITCH_MIN, max: PLAY_PITCH_MAX };
}

export function zoomLimits() {
  if (DEV_FREE_CAMERA) return { min: DEV_ZOOM_MIN, max: DEV_ZOOM_MAX };
  return { min: PLAY_ZOOM_MIN, max: PLAY_ZOOM_MAX };
}
