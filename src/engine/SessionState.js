/**
 * SessionState — Persists car pose and camera in localStorage across reloads.
 */

const STORAGE_KEY = 'city.session.v1';

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.car || !data?.camera) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSession(vehicleController, mouse, thirdPersonCamera) {
  const body = vehicleController.chassisBody;
  const cam = thirdPersonCamera.camera;
  const target = thirdPersonCamera.orbitControls.target;

  const data = {
    car: {
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
      qx: body.quaternion.x,
      qy: body.quaternion.y,
      qz: body.quaternion.z,
      qw: body.quaternion.w
    },
    camera: {
      mode: thirdPersonCamera.mode,
      yaw: mouse.yaw,
      pitch: mouse.pitch,
      zoom: mouse.zoomDistance,
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      tx: target.x,
      ty: target.y,
      tz: target.z
    }
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota / private mode — ignore
  }
}

export function bindSessionAutosave(vehicleController, mouse, thirdPersonCamera) {
  const persist = () => saveSession(vehicleController, mouse, thirdPersonCamera);
  const timer = window.setInterval(persist, 500);
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  return () => window.clearInterval(timer);
}
