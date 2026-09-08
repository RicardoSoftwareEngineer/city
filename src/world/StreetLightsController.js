/**
 * Night-only downtown street lighting — lean SpotLight pool, no per-pole lights.
 *
 * - Shared bulb materials: emissiveIntensity follows nightFactor × emissiveMul.
 * - At most MAX_ACTIVE SpotLights on the nearest poles to focus (XZ), aimed
 *   down toward the roadway so asphalt/sidewalk get a warm wash cone.
 * - Lights never castShadow (poles may).
 * - Tunables via DEFAULT_PARAMS / setParams / window.__cityStreetLights.
 */

import * as THREE from 'three';
import {
  STREETLIGHT_SCALE,
  getStreetlightBulbMaterials
} from './streetFurniture/streetlight.js';

/** Raw GLB Inners AABB center (pre-scale). */
const BULB_RAW = { x: -0.05, y: 79.05, z: 0 };

const MAX_ACTIVE = 6;
const REFOCUS_EPS = 4;
const REFOCUS_EPS_SQ = REFOCUS_EPS * REFOCUS_EPS;

/**
 * Tuned for night ACES exposure (~0.55): Spot concentrates energy on the
 * street so the wash reads on asphalt/sidewalk (Standard/Lambert receivers).
 */
export const DEFAULT_PARAMS = Object.freeze({
  color: 0xffd090,
  intensity: 18,
  distance: 40,
  decay: 1.75,
  angle: 0.68,
  penumbra: 0.55,
  /** Soft fill PointLight under each spot (0 = spot only). */
  pointIntensity: 3.2,
  pointDistance: 22,
  pointDecay: 2,
  emissiveMul: 1.2,
  /** Meters from bulb toward roadway (±X for N–S curb poles). */
  aimAlong: 6,
  groundY: -0.15,
  maxLights: MAX_ACTIVE
});

const _bulb = new THREE.Vector3();

/**
 * @param {{ scene: THREE.Scene, maxLights?: number }} opts
 */
export function createStreetLightsController(opts) {
  const scene = opts.scene;
  const params = { ...DEFAULT_PARAMS };
  if (opts.maxLights != null) {
    params.maxLights = Math.max(1, Math.min(8, opts.maxLights | 0));
  }
  const maxLights = params.maxLights;

  /** @type {{ x: number, z: number, rot?: number, scale?: number, y?: number }[]} */
  let poses = [];
  let nightFactor = 0;
  let lastFocusX = Infinity;
  let lastFocusZ = Infinity;
  let hasFocus = false;
  let forceRefocus = true;
  /** @type {number[]} */
  let activeIdx = [];

  /** @type {{ spot: THREE.SpotLight, point: THREE.PointLight }[]} */
  const slots = [];
  for (let i = 0; i < maxLights; i++) {
    const spot = new THREE.SpotLight(
      params.color,
      0,
      params.distance,
      params.angle,
      params.penumbra,
      params.decay
    );
    spot.name = `streetLampSpot_${i}`;
    spot.castShadow = false;
    spot.visible = false;
    spot.target.name = `streetLampSpotTarget_${i}`;
    scene.add(spot);
    scene.add(spot.target);

    const point = new THREE.PointLight(params.color, 0, params.pointDistance, params.pointDecay);
    point.name = `streetLampPoint_${i}`;
    point.castShadow = false;
    point.visible = false;
    scene.add(point);

    slots.push({ spot, point });
  }

  function applyBulbEmissive() {
    const mats = getStreetlightBulbMaterials();
    const mul = params.emissiveMul;
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      const maxEi = mat.userData._streetBulbMaxEi ?? 1.25;
      mat.emissiveIntensity = maxEi * nightFactor * mul;
    }
  }

  function setPoses(next) {
    poses = Array.isArray(next) ? next : [];
    forceRefocus = true;
    if (hasFocus) {
      pickNearest(lastFocusX, lastFocusZ);
      forceRefocus = false;
    } else {
      activeIdx = [];
    }
    syncLights();
  }

  function setNightFactor(nf) {
    nightFactor = THREE.MathUtils.clamp(Number(nf) || 0, 0, 1);
    applyBulbEmissive();
    syncLights();
  }

  /**
   * Live study knobs — partial patch; rebuilds light props on next sync.
   * @param {Partial<typeof DEFAULT_PARAMS>} patch
   */
  function setParams(patch) {
    if (!patch || typeof patch !== 'object') return getParams();
    if (patch.color != null) params.color = Number(patch.color) >>> 0;
    if (patch.intensity != null) params.intensity = Math.max(0, Number(patch.intensity) || 0);
    if (patch.distance != null) params.distance = Math.max(1, Number(patch.distance) || 1);
    if (patch.decay != null) params.decay = Math.max(0, Number(patch.decay) || 0);
    if (patch.angle != null) {
      params.angle = THREE.MathUtils.clamp(Number(patch.angle) || 0.1, 0.05, Math.PI / 2);
    }
    if (patch.penumbra != null) {
      params.penumbra = THREE.MathUtils.clamp(Number(patch.penumbra) || 0, 0, 1);
    }
    if (patch.pointIntensity != null) {
      params.pointIntensity = Math.max(0, Number(patch.pointIntensity) || 0);
    }
    if (patch.pointDistance != null) {
      params.pointDistance = Math.max(1, Number(patch.pointDistance) || 1);
    }
    if (patch.pointDecay != null) {
      params.pointDecay = Math.max(0, Number(patch.pointDecay) || 0);
    }
    if (patch.emissiveMul != null) {
      params.emissiveMul = Math.max(0, Number(patch.emissiveMul) || 0);
    }
    if (patch.aimAlong != null) params.aimAlong = Number(patch.aimAlong) || 0;
    if (patch.groundY != null) params.groundY = Number(patch.groundY) || 0;
    applyBulbEmissive();
    syncLights();
    return getParams();
  }

  function getParams() {
    return { ...params, maxLights };
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
    const col = params.color;
    const spotI = params.intensity * nightFactor;
    const pointI = params.pointIntensity * nightFactor;
    const usePoint = params.pointIntensity > 0.01;

    for (let i = 0; i < slots.length; i++) {
      const { spot, point } = slots[i];
      const poseIndex = activeIdx[i];
      if (!on || poseIndex == null) {
        spot.intensity = 0;
        spot.visible = false;
        point.intensity = 0;
        point.visible = false;
        continue;
      }
      const pose = poses[poseIndex];
      bulbWorld(pose, _bulb);
      spot.position.copy(_bulb);
      spot.color.setHex(col);
      spot.distance = params.distance;
      spot.angle = params.angle;
      spot.penumbra = params.penumbra;
      spot.decay = params.decay;
      spot.intensity = spotI;
      spot.visible = true;

      // Aim down toward roadway (pole long axis faces street via pose.rot).
      const yaw = pose.rot ?? 0;
      const along = params.aimAlong;
      spot.target.position.set(
        _bulb.x + Math.cos(yaw) * along,
        params.groundY,
        _bulb.z + -Math.sin(yaw) * along
      );
      spot.target.updateMatrixWorld();

      if (usePoint) {
        point.position.copy(_bulb);
        point.color.setHex(col);
        point.distance = params.pointDistance;
        point.decay = params.pointDecay;
        point.intensity = pointI;
        point.visible = true;
      } else {
        point.intensity = 0;
        point.visible = false;
      }
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
    if (forceRefocus || !hasFocus || dx * dx + dz * dz >= REFOCUS_EPS_SQ) {
      lastFocusX = fx;
      lastFocusZ = fz;
      hasFocus = true;
      forceRefocus = false;
      pickNearest(fx, fz);
    }
    syncLights();
  }

  function dispose() {
    for (const { spot, point } of slots) {
      scene.remove(spot);
      scene.remove(spot.target);
      scene.remove(point);
    }
    slots.length = 0;
    poses = [];
    activeIdx = [];
  }

  return {
    setPoses,
    setNightFactor,
    setParams,
    getParams,
    update,
    dispose,
    get maxLights() {
      return maxLights;
    }
  };
}
