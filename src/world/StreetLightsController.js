/**
 * Night-only downtown street lighting — lean SpotLight pool, no per-pole lights.
 *
 * - Shared bulb materials: emissiveIntensity follows nightFactor × emissiveMul.
 * - At most MAX_ACTIVE SpotLights on the nearest poles to focus (XZ), aimed
 *   mostly downward (small aimAlong) so curb grass + roadway both get wash.
 * - Lights never castShadow (poles may).
 * - Tunables via DEFAULT_PARAMS / setParams / window.__cityStreetLights.
 * - Study HUD: enabledSpot / enabledPoint / enabledEmissive gate contributions.
 */

import * as THREE from 'three';
import {
  STREETLIGHT_SCALE,
  getStreetlightBulbMaterials
} from './streetFurniture/streetlight.js';
import { STREET_WASH_LAYER } from './lightLayers.js';

/** Raw GLB Inners AABB center (pre-scale). */
const BULB_RAW = { x: -0.05, y: 79.05, z: 0 };

const MAX_ACTIVE = 6;
const SLOT_CAP = 8;
const REFOCUS_EPS = 4;
const REFOCUS_EPS_SQ = REFOCUS_EPS * REFOCUS_EPS;

/**
 * Tuned for night ACES exposure (~0.55): Spot + Point fill wash asphalt,
 * sidewalk, and curb-side terrain grass (MeshLambert splat receives lights).
 */
/** localStorage key for study HUD + controller params. */
export const STORAGE_KEY = 'city-street-lights-v1';

export const DEFAULT_PARAMS = Object.freeze({
  color: 0xffd090,
  intensity: 18,
  distance: 40,
  decay: 1.75,
  angle: 0.68,
  penumbra: 0.55,
  /** Soft omnidirectional fill — washes curb-side grass/terrain near the pole. */
  pointIntensity: 8,
  pointDistance: 28,
  pointDecay: 2,
  emissiveMul: 1.2,
  /**
   * Meters from bulb along pole yaw toward roadway.
   * Small default so the Spot cone spills onto both curb sides (grass + street).
   */
  aimAlong: 1.5,
  groundY: -0.15,
  maxLights: MAX_ACTIVE,
  enabledSpot: true,
  enabledPoint: true,
  enabledEmissive: true
});

/**
 * @returns {{ params?: object, rowOn?: Record<string, boolean> } | null}
 */
export function loadStoredStreetLights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** @param {{ params?: object, rowOn?: Record<string, boolean> }} state */
export function saveStoredStreetLights(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredStreetLights() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const _bulb = new THREE.Vector3();

/**
 * @param {{ scene: THREE.Scene, maxLights?: number }} opts
 */
export function createStreetLightsController(opts) {
  const scene = opts.scene;
  const params = { ...DEFAULT_PARAMS };
  if (opts.maxLights != null) {
    params.maxLights = Math.max(1, Math.min(SLOT_CAP, opts.maxLights | 0));
  }
  const storedAtCreate = loadStoredStreetLights();
  // Always allocate SLOT_CAP so study HUD can raise maxLights live.
  const slotCount = SLOT_CAP;

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
  for (let i = 0; i < slotCount; i++) {
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
    // Wash asphalt / sidewalk / terrain only — not every downtown Standard mesh.
    spot.layers.set(STREET_WASH_LAYER);
    spot.target.name = `streetLampSpotTarget_${i}`;
    scene.add(spot);
    scene.add(spot.target);

    const point = new THREE.PointLight(params.color, 0, params.pointDistance, params.pointDecay);
    point.name = `streetLampPoint_${i}`;
    point.castShadow = false;
    point.visible = false;
    point.layers.set(STREET_WASH_LAYER);
    scene.add(point);

    slots.push({ spot, point });
  }

  function applyBulbEmissive() {
    const mats = getStreetlightBulbMaterials();
    const mul = params.enabledEmissive ? params.emissiveMul : 0;
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
    // Finite values only — no upper clamp to HUD slider max (typed values win).
    if (patch.intensity != null) {
      const n = Number(patch.intensity);
      if (Number.isFinite(n)) params.intensity = Math.max(0, n);
    }
    if (patch.distance != null) {
      const n = Number(patch.distance);
      if (Number.isFinite(n)) params.distance = Math.max(1, n);
    }
    if (patch.decay != null) {
      const n = Number(patch.decay);
      if (Number.isFinite(n)) params.decay = Math.max(0, n);
    }
    if (patch.angle != null) {
      const n = Number(patch.angle);
      if (Number.isFinite(n)) {
        params.angle = THREE.MathUtils.clamp(n, 0.05, Math.PI / 2);
      }
    }
    if (patch.penumbra != null) {
      const n = Number(patch.penumbra);
      if (Number.isFinite(n)) params.penumbra = THREE.MathUtils.clamp(n, 0, 1);
    }
    if (patch.pointIntensity != null) {
      const n = Number(patch.pointIntensity);
      if (Number.isFinite(n)) params.pointIntensity = Math.max(0, n);
    }
    if (patch.pointDistance != null) {
      const n = Number(patch.pointDistance);
      if (Number.isFinite(n)) params.pointDistance = Math.max(1, n);
    }
    if (patch.pointDecay != null) {
      const n = Number(patch.pointDecay);
      if (Number.isFinite(n)) params.pointDecay = Math.max(0, n);
    }
    if (patch.emissiveMul != null) {
      const n = Number(patch.emissiveMul);
      if (Number.isFinite(n)) params.emissiveMul = Math.max(0, n);
    }
    if (patch.aimAlong != null) {
      const n = Number(patch.aimAlong);
      if (Number.isFinite(n)) params.aimAlong = n;
    }
    if (patch.groundY != null) {
      const n = Number(patch.groundY);
      if (Number.isFinite(n)) params.groundY = n;
    }
    if (patch.maxLights != null) {
      const next = Math.max(1, Math.min(slots.length, patch.maxLights | 0));
      if (next !== params.maxLights) {
        params.maxLights = next;
        forceRefocus = true;
        if (hasFocus) {
          pickNearest(lastFocusX, lastFocusZ);
          forceRefocus = false;
        }
      }
    }
    if (patch.enabledSpot != null) params.enabledSpot = Boolean(patch.enabledSpot);
    if (patch.enabledPoint != null) params.enabledPoint = Boolean(patch.enabledPoint);
    if (patch.enabledEmissive != null) params.enabledEmissive = Boolean(patch.enabledEmissive);
    applyBulbEmissive();
    syncLights();
    persistParams();
    return getParams();
  }

  function getParams() {
    return { ...params };
  }

  function persistParams() {
    const prev = loadStoredStreetLights() || {};
    saveStoredStreetLights({
      params: getParams(),
      rowOn: prev.rowOn && typeof prev.rowOn === 'object' ? prev.rowOn : undefined
    });
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
    const n = Math.min(params.maxLights, slots.length, scored.length);
    activeIdx = new Array(n);
    for (let i = 0; i < n; i++) activeIdx[i] = scored[i].i;
  }

  function syncLights() {
    const on = nightFactor > 0.04;
    const col = params.color;
    const spotI = (params.enabledSpot ? params.intensity : 0) * nightFactor;
    const pointI = (params.enabledPoint ? params.pointIntensity : 0) * nightFactor;
    const usePoint = params.enabledPoint && params.pointIntensity > 0.01;

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
      spot.visible = params.enabledSpot && spotI > 0;

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
  let lightsDirty = true;
  let lastSyncedNight = -1;

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
      lightsDirty = true;
    }
    if (lightsDirty || nightFactor !== lastSyncedNight) {
      syncLights();
      lightsDirty = false;
      lastSyncedNight = nightFactor;
    }
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

  // Merge persisted study knobs (typed large values + enable flags) after slots exist.
  if (storedAtCreate?.params && typeof storedAtCreate.params === 'object') {
    setParams(storedAtCreate.params);
  }

  return {
    setPoses,
    setNightFactor,
    setParams,
    getParams,
    update,
    dispose,
    get maxLights() {
      return params.maxLights;
    }
  };
}
