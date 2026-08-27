/**
 * Follow/orbit limits. DEV_FREE_CAMERA unlocks pitch and zoom for inspection.
 * Set to false before shipping so the camera cannot go through the ground.
 */

export const DEV_FREE_CAMERA = true;

export const PLAY_PITCH_MIN = 0.05;
export const PLAY_PITCH_MAX = Math.PI / 2.2;
export const PLAY_ZOOM_MIN = 4.0;
export const PLAY_ZOOM_MAX = 25.0;

export const DEV_PITCH_LIMIT = Math.PI / 2 - 0.02;
export const DEV_ZOOM_MIN = 0.4;
export const DEV_ZOOM_MAX = 400;

export function pitchLimits() {
  if (DEV_FREE_CAMERA) return { min: -DEV_PITCH_LIMIT, max: DEV_PITCH_LIMIT };
  return { min: PLAY_PITCH_MIN, max: PLAY_PITCH_MAX };
}

export function zoomLimits() {
  if (DEV_FREE_CAMERA) return { min: DEV_ZOOM_MIN, max: DEV_ZOOM_MAX };
  return { min: PLAY_ZOOM_MIN, max: PLAY_ZOOM_MAX };
}
