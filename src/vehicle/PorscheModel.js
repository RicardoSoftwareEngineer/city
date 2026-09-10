/**
 * PorscheModel — Loads hero-car glTFs and sets up wheel pivot groups
 * for visual steering and spin animation.
 *
 * Models are scaled to PORSCHE_TARGET_LENGTH and centered so the physics
 * chassis still fits. Wheel nodes are re-parented into steer → spin pivots
 * so VehicleController can rotate them independently.
 *
 * Visual modes (HUD): 'porsche' | 'mercedes' | 'mercedesOriginal' | 'defender' | 'box'
 * - porsche / mercedes / mercedesOriginal: glTF (when ready)
 * - defender: procedural Land Rover Defender 90 (Box/Cylinder/Plane)
 * - box: crude placeholder
 * - compareAb: show both mercedes roots offset on X for A/B
 *
 * File name kept for churn control; class owns all HUD car visuals.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cachedFetch } from '../engine/assetDiskCache.js';
import { beginLoad, loadMark } from '../engine/loadLog.js';
import {
  PORSCHE_TARGET_LENGTH,
  PORSCHE_ROOT_OFFSET_Y
} from '../world/RoadDimensions.js';
import { createProceduralDefender } from './ProceduralDefender.js';

/** @typedef {'porsche'|'mercedes'|'mercedesOriginal'|'defender'|'box'} CarVisualMode */

const MERGED_SPIN_RE = /^(AO_tire_main|wheel_rim|discs_Discs|metal_parts_rim)/i;

/**
 * Per-glTF car config. Wheel discovery:
 * - legacy named nodes (Porsche Godot export), else
 * - material/name matchers → merged XZ cluster split (Sketchfab-style).
 */
const GLTF_CARS = {
  porsche: {
    url: '/models/porsche/porsche_911_with_interior.glb',
    tag: 'porsche_911_with_interior.glb',
    wrapName: 'porsche-gltf',
    label: 'Porsche',
    /** Fixed Y offset tuned to physics chassis (historical). */
    rootOffsetY: PORSCHE_ROOT_OFFSET_Y,
    floorWheels: false,
    isTireMesh(obj) {
      return /tires/i.test(obj.name) || /^AO_tire_main/i.test(obj.name);
    },
    isSpinMesh(obj) {
      return MERGED_SPIN_RE.test(obj.name);
    }
  },
  mercedes: {
    url: '/models/mercedes/mercedes.glb',
    tag: 'mercedes.glb',
    wrapName: 'mercedes-gltf',
    label: 'Mercedes',
    rootOffsetY: 0,
    floorWheels: true,
    isTireMesh(obj) {
      return matNameMatches(obj, /TARMAC_TYRE/i);
    },
    isSpinMesh(obj) {
      // Merged four-corner tire/rim/disc meshes (unnamed nodes; materials only).
      return matNameMatches(obj, /TARMAC_TYRE|TARMAC_WHEEL|^DISCS$/i);
    }
  },
  mercedesOriginal: {
    url: '/models/mercedes/mercedes.original.glb',
    tag: 'mercedes.original.glb',
    wrapName: 'mercedes-original-gltf',
    label: 'Mercedes (orig)',
    rootOffsetY: 0,
    floorWheels: true,
    isTireMesh(obj) {
      return matNameMatches(obj, /TARMAC_TYRE/i);
    },
    isSpinMesh(obj) {
      return matNameMatches(obj, /TARMAC_TYRE|TARMAC_WHEEL|^DISCS$/i);
    }
  }
};

// Legacy named wheels (porsche.glb / Godot export). New Sketchfab asset merges
// all tires/rims into one mesh — see discoverWheelObjects().
const WHEEL_PARTS = [
  { wheel: 'wheel_lrchild001_6', hub: 'hub_lr_2' },
  { wheel: 'wheel_lrchild003_8', hub: 'hub_rr_1' },
  { wheel: 'wheel_lrchild_5',    hub: 'hub_lf_3' },
  { wheel: 'wheel_lrchild002_7', hub: 'hub_rf_4' }
];

function matNameMatches(obj, re) {
  const mats = obj.material
    ? (Array.isArray(obj.material) ? obj.material : [obj.material])
    : [];
  return mats.some((m) => re.test(m?.name || ''));
}

export class PorscheModel {
  constructor() {
    this.chassisGroup = new THREE.Group();  // The group added to the scene
    this.wheelPivots = {};                  // Active mode pivots (FL/FR/RL/RR)
    this._placeholder = null;
    this._gltfRoot = null;                 // Alias: porsche wrap (compat)
    this._defender = null;
    /** @type {Record<string, { root: THREE.Group, wheelPivots: object }>} */
    this._gltfByMode = {};
    /** @type {CarVisualMode} */
    this._visualMode = 'box';
    this.ready = false;                    // porsche glTF ready
    this.mercedesReady = false;
    this.mercedesOriginalReady = false;
    /** @type {boolean} side-by-side mercedes A/B ghost */
    this._compareAb = false;
    /** @type {Record<string, { id: string, label: string, fetchMs: number, parseMs: number, totalMs: number, bytes: number, tris: number|null }>} */
    this._loadStats = {};
    /** @type {Record<string, Promise<void>>} */
    this._loadPromises = {};
  }

  /**
   * Cheap stand-in so GameLoop can start before the glTF finishes.
   * Kept (hidden) after load so HUD can toggle box vs Porsche instantly.
   */
  attachPlaceholder() {
    if (this._placeholder) return;
    const group = new THREE.Group();
    group.name = 'porsche-placeholder';

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), bodyMat);
    body.position.y = 0.55;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.7), cabinMat);
    cabin.position.set(0, 0.95, -0.15);
    group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 10);
    const tracks = [-0.82, 0.82];
    const axles = [1.25, -1.35];
    for (const x of tracks) {
      for (const z of axles) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.35, z);
        group.add(wheel);
      }
    }

    this._placeholder = group;
    this.chassisGroup.add(group);
  }

  /** Lazy-build procedural Defender; kept parented for instant HUD toggles. */
  attachDefender() {
    if (this._defender) return;
    this._defender = createProceduralDefender();
    this._defender.visible = false;
    this.chassisGroup.add(this._defender);
  }

  /** Dispose placeholder for good — prefer hide via setVisualMode for toggles. */
  clearPlaceholder() {
    if (!this._placeholder) return;
    this._placeholder.removeFromParent();
    const seenGeo = new Set();
    const seenMat = new Set();
    this._placeholder.traverse((obj) => {
      if (obj.geometry && !seenGeo.has(obj.geometry)) {
        seenGeo.add(obj.geometry);
        obj.geometry.dispose();
      }
      const mats = obj.material
        ? (Array.isArray(obj.material) ? obj.material : [obj.material])
        : [];
      for (const mat of mats) {
        if (!mat || seenMat.has(mat)) continue;
        seenMat.add(mat);
        mat.dispose();
      }
    });
    this._placeholder = null;
  }

  /** Load Porsche glTF (default hero). Safe after GameLoop is running. */
  async load() {
    return this.loadGltf('porsche');
  }

  /** Load optimized Mercedes GLB (lazy HUD). */
  async loadMercedes() {
    return this.loadGltf('mercedes');
  }

  /** Load preserved Mercedes original for A/B. */
  async loadMercedesOriginal() {
    return this.loadGltf('mercedesOriginal');
  }

  /**
   * @param {'porsche'|'mercedes'|'mercedesOriginal'} mode
   */
  async loadGltf(mode) {
    const cfg = GLTF_CARS[mode];
    if (!cfg) throw new Error(`unknown glTF car mode: ${mode}`);
    if (this._gltfByMode[mode]) return;
    if (this._loadPromises[mode]) return this._loadPromises[mode];

    this._loadPromises[mode] = this._loadGltfInner(mode, cfg).finally(() => {
      delete this._loadPromises[mode];
    });
    return this._loadPromises[mode];
  }

  /**
   * @param {'porsche'|'mercedes'|'mercedesOriginal'} mode
   * @param {typeof GLTF_CARS[keyof typeof GLTF_CARS]} cfg
   */
  async _loadGltfInner(mode, cfg) {
    const url = cfg.url;
    const loader = new GLTFLoader();
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
    const dir = url.slice(0, url.lastIndexOf('/') + 1);

    const tFetch0 = performance.now();
    const res = await cachedFetch(url);
    if (!res.ok) throw new Error(`${mode} fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    const fetchMs = performance.now() - tFetch0;
    const bytes = buf.byteLength;

    return new Promise((resolve, reject) => {
      beginLoad('gltf:parse', cfg.tag);
      const tParse0 = performance.now();
      loader.parse(
        buf,
        dir,
        (gltf) => {
          try {
            const root = gltf.scene || gltf.scenes[0];
            this.setupModel(root, mode);
            const parseMs = performance.now() - tParse0;
            loadMark('gltf:parse', cfg.tag, parseMs);
            const tris = countRootTris(this._gltfByMode[mode]?.root);
            this._loadStats[mode] = {
              id: mode,
              label: cfg.label || mode,
              fetchMs: Math.round(fetchMs),
              parseMs: Math.round(parseMs),
              totalMs: Math.round(fetchMs + parseMs),
              bytes,
              tris
            };
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        reject
      );
    });
  }

  /**
   * Last measured load stats for glTF cars (plus static N/A rows for procedural).
   * @returns {Array<{ id: string, label: string, fetchMs: number|null, parseMs: number|null, totalMs: number|null, bytes: number|null, tris: number|null, note?: string }>}
   */
  getLoadStats() {
    const rows = [];
    for (const id of ['porsche', 'mercedes', 'mercedesOriginal']) {
      const s = this._loadStats[id];
      const cfg = GLTF_CARS[id];
      if (s) rows.push({ ...s });
      else {
        rows.push({
          id,
          label: cfg?.label || id,
          fetchMs: null,
          parseMs: null,
          totalMs: null,
          bytes: null,
          tris: null,
          note: 'ainda não carregado'
        });
      }
    }
    rows.push({
      id: 'defender',
      label: 'Defender',
      fetchMs: 0,
      parseMs: 0,
      totalMs: 0,
      bytes: null,
      tris: null,
      note: 'procedural'
    });
    rows.push({
      id: 'box',
      label: 'quadrado',
      fetchMs: 0,
      parseMs: 0,
      totalMs: 0,
      bytes: null,
      tris: null,
      note: 'instantâneo'
    });
    return rows;
  }

  /**
   * @param {THREE.Object3D} sceneRoot
   * @param {'porsche'|'mercedes'|'mercedesOriginal'} mode
   */
  setupModel(sceneRoot, mode = 'porsche') {
    const cfg = GLTF_CARS[mode];
    if (!cfg) return;
    if (this._placeholder) this._placeholder.visible = false;

    const model = sceneRoot;
    const boundingBox = new THREE.Box3().setFromObject(model);
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());

    // Center geometry on local origin BEFORE scale/rotate so scale does not drift
    // a Sketchfab pivot (bbox center far from node origin).
    model.position.set(-center.x, -center.y, -center.z);

    const wrap = new THREE.Group();
    wrap.name = cfg.wrapName;
    wrap.add(model);

    const currentLength = Math.max(size.z, size.x);
    const scale = PORSCHE_TARGET_LENGTH / currentLength;
    wrap.scale.set(scale, scale, scale);

    // Orient correctly (faces +Z forward)
    if (size.x > size.z) {
      wrap.rotation.y = -Math.PI / 2;
    } else {
      wrap.rotation.y = Math.PI;
    }
    wrap.position.y = cfg.rootOffsetY;
    wrap.updateMatrixWorld(true);

    const wheelObjects = this.discoverWheelObjects(wrap, cfg);
    // Nudge so axle midpoint sits on chassis X/Z (body bbox can be asymmetric).
    if (wheelObjects.length >= 4) {
      const mid = new THREE.Vector3();
      for (const w of wheelObjects) mid.add(w.worldCenter);
      mid.multiplyScalar(1 / wheelObjects.length);
      wrap.position.x -= mid.x;
      wrap.position.z -= mid.z;
      wrap.updateMatrixWorld(true);
      for (const w of wheelObjects) {
        w.object.getWorldPosition(w.worldCenter);
      }
    }

    if (cfg.floorWheels) {
      wrap.updateMatrixWorld(true);
      const floored = new THREE.Box3().setFromObject(wrap);
      if (Number.isFinite(floored.min.y)) {
        wrap.position.y -= floored.min.y;
        wrap.updateMatrixWorld(true);
        for (const w of wheelObjects) {
          w.object.getWorldPosition(w.worldCenter);
        }
      }
    }

    const measured = wheelObjects
      .map((w) => ({ ...w, x: w.worldCenter.x, z: w.worldCenter.z }))
      .filter((w) => w.object);

    measured.sort((a, b) => b.z - a.z);
    const frontPair = measured.slice(0, 2);
    const rearPair = measured.slice(2);
    const pick = (pair, wantRight) =>
      pair.slice().sort((a, b) => a.x - b.x)[wantRight ? 1 : 0];

    const wheelPivots =
      measured.length >= 4
        ? {
            frontLeft:  this.createWheelPivot(pick(frontPair, false), true, false),
            frontRight: this.createWheelPivot(pick(frontPair, true),  true, true),
            rearLeft:   this.createWheelPivot(pick(rearPair, false),  false, false),
            rearRight:  this.createWheelPivot(pick(rearPair, true),   false, true)
          }
        : {};

    if (measured.length < 4) {
      console.warn(
        `[PorscheModel] ${mode}: wheel discovery found ${measured.length}/4 — ` +
          'body will show; steering/spin animation degraded'
      );
    }

    // Keep source materials + maps. Drop tiny badges/emblems that only add noise.
    const drop = [];
    wrap.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
      const verts = child.geometry?.attributes.position?.count ?? 0;
      const matName = child.material?.name || '';
      if (
        (verts > 0 && verts <= 24) ||
        child.name === 'Object_50' ||
        /emblem/i.test(matName)
      ) {
        drop.push(child);
      }
    });
    for (const mesh of drop) mesh.removeFromParent();

    // Hide until HUD selects this mode (porsche auto-shows below for legacy).
    wrap.visible = false;
    this.chassisGroup.add(wrap);
    this._gltfByMode[mode] = { root: wrap, wheelPivots };

    if (mode === 'porsche') {
      this._gltfRoot = wrap;
      this.ready = true;
      // Legacy: switch to Porsche when it finishes if still on the box stand-in.
      if (this._visualMode === 'box') {
        this._applyVisibility('porsche');
      }
    } else if (mode === 'mercedes') {
      this.mercedesReady = true;
    } else if (mode === 'mercedesOriginal') {
      this.mercedesOriginalReady = true;
    }

    // Re-apply A/B offsets if compare was already on.
    if (this._compareAb) this._syncCompareAbOffsets();
  }

  /**
   * Resolve four corner wheel Object3Ds.
   * Prefers legacy named nodes; otherwise splits merged tire/rim meshes by
   * world XZ clusters.
   */
  discoverWheelObjects(wrap, cfg) {
    const legacy = [];
    for (const part of WHEEL_PARTS) {
      const wheelObject = wrap.getObjectByName(part.wheel);
      if (!wheelObject) continue;
      const worldCenter = new THREE.Vector3();
      wheelObject.getWorldPosition(worldCenter);
      const hubObject = part.hub ? wrap.getObjectByName(part.hub) : null;
      legacy.push({ object: wheelObject, hub: hubObject, worldCenter });
    }
    if (legacy.length >= 4) return legacy.slice(0, 4);

    return this.splitMergedWheels(wrap, cfg);
  }

  /**
   * Sketchfab-style exports pack all four tires (and rims/discs) into single
   * meshes. Cluster tire verts in XZ, split spin meshes into four corner groups.
   */
  splitMergedWheels(wrap, cfg) {
    let tireMesh = null;
    wrap.traverse((obj) => {
      if (tireMesh || !obj.isMesh) return;
      if (cfg.isTireMesh(obj)) tireMesh = obj;
    });
    if (!tireMesh?.geometry?.attributes?.position) return [];

    const worldCenters = clusterFourXZ(tireMesh);
    if (worldCenters.length < 4) return [];

    const spinMeshes = [];
    wrap.traverse((obj) => {
      if (!obj.isMesh) return;
      if (cfg.isSpinMesh(obj)) spinMeshes.push(obj);
    });

    const groups = worldCenters.map((wc, i) => {
      const g = new THREE.Group();
      g.name = `wheel_split_${i}`;
      const local = wc.clone();
      wrap.worldToLocal(local);
      g.position.copy(local);
      wrap.add(g);
      return g;
    });

    for (const mesh of spinMeshes) {
      const geos = splitMeshByWorldCenters(mesh, worldCenters, wrap);
      const mat = mesh.material;
      for (let i = 0; i < 4; i++) {
        if (!geos[i]) continue;
        const localCenter = groups[i].position;
        const pos = geos[i].attributes.position;
        for (let v = 0; v < pos.count; v++) {
          pos.setXYZ(
            v,
            pos.getX(v) - localCenter.x,
            pos.getY(v) - localCenter.y,
            pos.getZ(v) - localCenter.z
          );
        }
        pos.needsUpdate = true;
        const part = new THREE.Mesh(geos[i], mat);
        part.name = `${mesh.name || mesh.material?.name || 'spin'}__${i}`;
        part.castShadow = true;
        part.receiveShadow = false;
        groups[i].add(part);
      }
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }

    return groups.map((g) => {
      const worldCenter = new THREE.Vector3();
      g.getWorldPosition(worldCenter);
      return { object: g, hub: null, worldCenter };
    });
  }

  /**
   * Create steer → spin pivot hierarchy for a single wheel.
   * @param {{ object: THREE.Object3D, hub?: THREE.Object3D|null }|null} part
   */
  createWheelPivot(part, isFront, isRight) {
    if (!part?.object) return null;
    const wheelObject = part.object;
    const hubObject = part.hub || null;

    const originalPosition = wheelObject.position.clone();
    const parent = wheelObject.parent;

    const steerPivot = new THREE.Group();
    steerPivot.position.copy(originalPosition);
    parent.add(steerPivot);

    const spinPivot = new THREE.Group();
    steerPivot.add(spinPivot);

    wheelObject.position.set(0, 0, 0);
    spinPivot.add(wheelObject);

    if (hubObject) {
      hubObject.position.x -= originalPosition.x;
      hubObject.position.y -= originalPosition.y;
      hubObject.position.z -= originalPosition.z;
      steerPivot.add(hubObject);
    }

    return { steerPivot, spinPivot, isFront, isRight };
  }

  canShowPorsche() {
    return this.ready;
  }

  canShowMercedes() {
    return this.mercedesReady;
  }

  canShowMercedesOriginal() {
    return this.mercedesOriginalReady;
  }

  getVisualMode() {
    return this._visualMode;
  }

  getCompareAb() {
    return this._compareAb;
  }

  /**
   * Side-by-side A/B: selected mercedes at chassis, the other offset +3 m local X.
   * @param {boolean} on
   */
  setCompareAb(on) {
    this._compareAb = !!on;
    this._syncCompareAbOffsets();
    // Re-show current mode so visibility picks up the ghost.
    this._applyVisibility(this._visualMode);
  }

  _syncCompareAbOffsets() {
    const COMPARE_X = 3;
    const opt = this._gltfByMode.mercedes;
    const orig = this._gltfByMode.mercedesOriginal;
    if (opt) opt.root.position.x = 0;
    if (orig) orig.root.position.x = 0;
    if (!this._compareAb) return;
    const mode = this._visualMode;
    if (mode === 'mercedes' && orig) {
      orig.root.position.x = COMPARE_X;
    } else if (mode === 'mercedesOriginal' && opt) {
      opt.root.position.x = COMPARE_X;
    }
  }

  /**
   * Ensure a glTF mode is loaded (lazy), then show it.
   * @param {CarVisualMode} mode
   * @returns {Promise<void>}
   */
  async ensureVisualMode(mode) {
    if (mode === 'mercedes' && !this._gltfByMode.mercedes) {
      await this.loadMercedes();
    } else if (mode === 'mercedesOriginal' && !this._gltfByMode.mercedesOriginal) {
      await this.loadMercedesOriginal();
    } else if (mode === 'porsche' && !this._gltfByMode.porsche) {
      await this.load();
    }
    if (this._compareAb && (mode === 'mercedes' || mode === 'mercedesOriginal')) {
      const other = mode === 'mercedes' ? 'mercedesOriginal' : 'mercedes';
      if (!this._gltfByMode[other]) {
        await this.loadGltf(other);
      }
    }
    this.setVisualMode(mode);
  }

  /**
   * Show one of: loaded glTFs, procedural Defender, or crude box.
   * @param {CarVisualMode} mode
   */
  setVisualMode(mode) {
    if (mode === 'porsche') {
      if (!this.ready || !this._gltfByMode.porsche) {
        this._applyVisibility('box');
        return;
      }
      this._applyVisibility('porsche');
      return;
    }

    if (mode === 'mercedes') {
      if (!this.mercedesReady || !this._gltfByMode.mercedes) {
        this._applyVisibility(this.ready ? 'porsche' : 'box');
        return;
      }
      this._applyVisibility('mercedes');
      return;
    }

    if (mode === 'mercedesOriginal') {
      if (!this.mercedesOriginalReady || !this._gltfByMode.mercedesOriginal) {
        this._applyVisibility(
          this.mercedesReady ? 'mercedes' : this.ready ? 'porsche' : 'box'
        );
        return;
      }
      this._applyVisibility('mercedesOriginal');
      return;
    }

    if (mode === 'defender') {
      this.attachDefender();
      this._applyVisibility('defender');
      return;
    }

    if (!this._placeholder) this.attachPlaceholder();
    this._applyVisibility('box');
  }

  /** @param {CarVisualMode} mode */
  _applyVisibility(mode) {
    this._visualMode = mode;
    this._syncCompareAbOffsets();

    const showGhost =
      this._compareAb &&
      (mode === 'mercedes' || mode === 'mercedesOriginal');
    const ghostId =
      mode === 'mercedes'
        ? 'mercedesOriginal'
        : mode === 'mercedesOriginal'
          ? 'mercedes'
          : null;

    for (const [id, entry] of Object.entries(this._gltfByMode)) {
      if (id === mode) {
        entry.root.visible = true;
      } else if (showGhost && id === ghostId) {
        entry.root.visible = true;
      } else {
        entry.root.visible = false;
      }
    }
    if (this._defender) this._defender.visible = mode === 'defender';
    if (this._placeholder) this._placeholder.visible = mode === 'box';
    else if (mode === 'box') this.attachPlaceholder();

    const gltf = this._gltfByMode[mode];
    this.wheelPivots = gltf ? gltf.wheelPivots : {};
  }

  /**
   * Apply cannon-es wheel transforms. `wheels` is FL, FR, RL, RR.
   * Spin uses one sign for all four: right glTF meshes are scale.x = -1,
   * but rotation is on the unscaled spinPivot parent.
   * cannon-es uses m = -1 on Y-up, so rotation.x = -info.rotation
   * makes the tire top move with car forward.
   */
  updateWheels(wheels) {
    const keys = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
    for (let i = 0; i < keys.length; i++) {
      const pivot = this.wheelPivots[keys[i]];
      const info = wheels[i];
      if (!pivot || !info) continue;

      if (pivot.isFront && pivot.steerPivot) {
        pivot.steerPivot.rotation.y = info.steering;
      }
      if (pivot.spinPivot) {
        pivot.spinPivot.rotation.x = -info.rotation;
      }
    }
  }
}


function countRootTris(root) {
  if (!root) return null;
  let tris = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry;
    const idx = geo.index;
    if (idx) tris += idx.count / 3;
    else {
      const pos = geo.attributes?.position;
      if (pos) tris += pos.count / 3;
    }
  });
  return Math.round(tris);
}

/** K-means (k=4) on mesh vertex world XZ — returns 4 world-space centroids. */
function clusterFourXZ(mesh) {
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const pts = [];
  const stride = Math.max(1, Math.floor(pos.count / 1500));
  for (let i = 0; i < pos.count; i += stride) {
    v.fromBufferAttribute(pos, i);
    mesh.localToWorld(v);
    pts.push(v.clone());
  }
  if (pts.length < 4) return [];

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sy = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    sy += p.y;
  }
  const meanY = sy / pts.length;
  const cents = [
    new THREE.Vector3(minX, meanY, minZ),
    new THREE.Vector3(minX, meanY, maxZ),
    new THREE.Vector3(maxX, meanY, minZ),
    new THREE.Vector3(maxX, meanY, maxZ)
  ];

  for (let iter = 0; iter < 12; iter++) {
    const buckets = [[], [], [], []];
    for (const p of pts) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < 4; i++) {
        const d = (p.x - cents[i].x) ** 2 + (p.z - cents[i].z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      buckets[bi].push(p);
    }
    for (let i = 0; i < 4; i++) {
      if (!buckets[i].length) continue;
      const c = new THREE.Vector3();
      for (const p of buckets[i]) c.add(p);
      c.multiplyScalar(1 / buckets[i].length);
      cents[i] = c;
    }
  }
  return cents;
}

/**
 * Split one mesh into up to 4 BufferGeometries (wrap-local baked positions),
 * assigning each triangle to the nearest world XZ cluster center.
 */
function splitMeshByWorldCenters(mesh, worldCenters, wrap) {
  const geometry = mesh.geometry;
  const srcPos = geometry.attributes.position;
  if (!srcPos) return [null, null, null, null];

  const wrapInv = new THREE.Matrix4();
  if (wrap) wrapInv.copy(wrap.matrixWorld).invert();
  const bake = new THREE.Matrix4().multiplyMatrices(wrapInv, mesh.matrixWorld);
  const normalMat = new THREE.Matrix3().getNormalMatrix(bake);

  const localCenters = worldCenters.map((wc) => {
    const c = wc.clone();
    if (wrap) wrap.worldToLocal(c);
    return c;
  });

  const idx = geometry.index;
  const triCount = idx ? idx.count / 3 : srcPos.count / 3;
  const buckets = [[], [], [], []];

  const c = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    let i0;
    let i1;
    let i2;
    if (idx) {
      i0 = idx.getX(t * 3);
      i1 = idx.getX(t * 3 + 1);
      i2 = idx.getX(t * 3 + 2);
    } else {
      i0 = t * 3;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }
    c.set(
      (srcPos.getX(i0) + srcPos.getX(i1) + srcPos.getX(i2)) / 3,
      (srcPos.getY(i0) + srcPos.getY(i1) + srcPos.getY(i2)) / 3,
      (srcPos.getZ(i0) + srcPos.getZ(i1) + srcPos.getZ(i2)) / 3
    );
    c.applyMatrix4(bake);
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const d =
        (c.x - localCenters[i].x) ** 2 + (c.z - localCenters[i].z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    buckets[bi].push(i0, i1, i2);
  }

  const attrNames = Object.keys(geometry.attributes);
  return buckets.map((tris) => {
    if (!tris.length) return null;
    const out = new THREE.BufferGeometry();
    const vertCount = tris.length;
    for (const name of attrNames) {
      const attr = geometry.attributes[name];
      const itemSize = attr.itemSize;
      const arr = new Float32Array(vertCount * itemSize);
      const tmp = new THREE.Vector3();
      for (let i = 0; i < vertCount; i++) {
        const src = tris[i];
        for (let k = 0; k < itemSize; k++) {
          arr[i * itemSize + k] = attr.getComponent(src, k);
        }
        if (name === 'position' && itemSize >= 3) {
          tmp.fromArray(arr, i * itemSize);
          tmp.applyMatrix4(bake);
          arr[i * itemSize] = tmp.x;
          arr[i * itemSize + 1] = tmp.y;
          arr[i * itemSize + 2] = tmp.z;
        } else if (name === 'normal' && itemSize >= 3) {
          tmp.fromArray(arr, i * itemSize);
          tmp.applyMatrix3(normalMat).normalize();
          arr[i * itemSize] = tmp.x;
          arr[i * itemSize + 1] = tmp.y;
          arr[i * itemSize + 2] = tmp.z;
        }
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
    }
    return out;
  });
}
