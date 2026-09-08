/**
 * Night-only downtown street lighting — lean pool, no per-pole PointLights.
 *
 * - Shared bulb materials: emissiveIntensity follows nightFactor (one write).
 * - At most MAX_ACTIVE PointLights on the nearest poles to the camera (XZ).
 * - Lights never castShadow (poles may).
 */

import * as THREE from 'three';
import {
  STREETLIGHT_SCALE,
  getStreetlightBulbMaterials
} from './streetFurniture/streetlight.js';

/** Raw GLB Inners AABB center (pre-scale). */
const BULB_RAW = { x: -0.05, y: 79.05, z: 0 };

const MAX_ACTIVE = 6;
const LIGHT_RANGE = 28;
const LIGHT_INTENSITY = 2.4;
const LIGHT_COLOR = 0xffe6b0;
const REFOCUS_EPS = 4;
const REFOCUS_EPS_SQ = REFOCUS_EPS * REFOCUS_EPS;

const _bulb = new THREE.Vector3();

/**
 * @param {{ scene: THREE.Scene, maxLights?: number }} opts
 */
export function createStreetLightsController(opts) {
  const scene = opts.scene;
  const maxLights = Math.max(1, opts.maxLights ?? MAX_ACTIVE);

  /** @type {{ x: number, z: number, rot?: number, scale?: number, y?: number }[]} */
  let poses = [];
  let nightFactor = 0;
  let lastFocusX = Infinity;
  let lastFocusZ = Infinity;
  /** @type {number[]} */
  let activeIdx = [];

  const lights = [];
  for (let i = 0; i < maxLights; i++) {
    const light = new THREE.PointLight(LIGHT_COLOR, 0, LIGHT_RANGE, 2);
    light.name = `streetLampPool_${i}`;
    light.castShadow = false;
    light.visible = false;
    scene.add(light);
    lights.push(light);
  }

  function setPoses(next) {
    poses = Array.isArray(next) ? next : [];
    lastFocusX = Infinity;
    lastFocusZ = Infinity;
    syncLights();
  }

  function setNightFactor(nf) {
    nightFactor = THREE.MathUtils.clamp(Number(nf) || 0, 0, 1);
    const mats = getStreetlightBulbMaterials();
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      const maxEi = mat.userData._streetBulbMaxEi ?? 1.25;
      mat.emissiveIntensity = maxEi * nightFactor;
    }
    syncLights();
  }

  function bulbWorld(pose, out) {
    const s = pose.scale ?? STREETLIGHT_SCALE;
    const lx = BULB_RAW.x * s;
    const ly = BULB_RAW.y * s;
    const lz = BULB_RAW.z * s;
    const yaw = pose.rot ?? 0;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    out.set(
      pose.x + lx * c + lz * sn,
      (pose.y ?? 0) + ly,
      pose.z + (-lx * sn + lz * c)
    );
    return out;
  }

  function pickNearest(fx, fz) {
    if (!poses.length) {
      activeIdx = [];
      return;
    }
    const scored = new Array(poses.length);
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const dx = p.x - fx;
      const dz = p.z - fz;
      scored[i] = { i, d: dx * dx + dz * dz };
    }
    scored.sort((a, b) => a.d - b.d);
    const n = Math.min(maxLights, scored.length);
    activeIdx = new Array(n);
    for (let i = 0; i < n; i++) activeIdx[i] = scored[i].i;
  }

  function syncLights() {
    const on = nightFactor > 0.04;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const poseIndex = activeIdx[i];
      if (!on || poseIndex == null) {
        light.intensity = 0;
        light.visible = false;
        continue;
      }
      bulbWorld(poses[poseIndex], _bulb);
      light.position.copy(_bulb);
      light.intensity = LIGHT_INTENSITY * nightFactor;
      light.distance = LIGHT_RANGE;
      light.visible = true;
    }
  }

  /**
   * @param {THREE.Camera} camera
   * @param {{ x: number, z: number } | null} [focus]
   */
  function update(camera, focus = null) {
    const fx = focus?.x ?? camera.position.x;
    const fz = focus?.z ?? camera.position.z;
    const dx = fx - lastFocusX;
    const dz = fz - lastFocusZ;
    if (dx * dx + dz * dz >= REFOCUS_EPS_SQ) {
      lastFocusX = fx;
      lastFocusZ = fz;
      pickNearest(fx, fz);
    }
    syncLights();
  }

  function dispose() {
    for (const light of lights) {
      scene.remove(light);
    }
    lights.length = 0;
    poses = [];
    activeIdx = [];
  }

  return {
    setPoses,
    setNightFactor,
    update,
    dispose,
    get maxLights() {
      return maxLights;
    }
  };
}
