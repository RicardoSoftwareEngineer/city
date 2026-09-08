/**
 * PorscheModel — Loads the Porsche 911 GLTF and sets up wheel pivot groups
 * for visual steering and spin animation.
 *
 * The model is scaled to PORSCHE_TARGET_LENGTH and centered.
 * Wheel nodes are re-parented into steer → spin pivot hierarchies so that
 * VehicleController can rotate them independently.
 *
 * Visual modes (HUD): 'porsche' | 'defender' | 'box'
 * - porsche: glTF (when ready)
 * - defender: procedural Land Rover Defender 90 (Box/Cylinder/Plane)
 * - box: crude placeholder
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cachedFetch } from '../engine/assetDiskCache.js';
import { beginLoad, loadMark } from '../engine/loadLog.js';
import {
  PORSCHE_TARGET_LENGTH,
  PORSCHE_ROOT_OFFSET_Y
} from '../world/RoadDimensions.js';
import { createProceduralDefender } from './ProceduralDefender.js';

const PORSCHE_GLB_URL = '/models/porsche/porsche_911_with_interior.glb';
const PORSCHE_GLB_TAG = 'porsche_911_with_interior.glb';

// Legacy named wheels (porsche.glb / Godot export). New Sketchfab asset merges
// all tires/rims into one mesh — see discoverWheelObjects().
const WHEEL_PARTS = [
  { wheel: 'wheel_lrchild001_6', hub: 'hub_lr_2' },
  { wheel: 'wheel_lrchild003_8', hub: 'hub_rr_1' },
  { wheel: 'wheel_lrchild_5',    hub: 'hub_lf_3' },
  { wheel: 'wheel_lrchild002_7', hub: 'hub_rf_4' }
];

/** Meshes that should spin with each corner wheel on the merged Sketchfab asset. */
const MERGED_SPIN_RE = /^(AO_tire_main|wheel_rim|discs_Discs|metal_parts_rim)/i;

export class PorscheModel {
  constructor() {
    this.chassisGroup = new THREE.Group();  // The group added to the scene
    this.wheelPivots = {};                  // { frontLeft: { steerPivot, spinPivot, isFront }, ... }
    this._placeholder = null;
    this._gltfRoot = null;
    this._defender = null;
    this._visualMode = 'box';              // 'porsche' | 'defender' | 'box'
    this.ready = false;
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

  /**
   * Load the Porsche GLB and return when ready.
   * Safe to call after GameLoop is already running (placeholder stays until then).
   */
  async load() {
    const url = PORSCHE_GLB_URL;
    const loader = new GLTFLoader();
    const dir = url.slice(0, url.lastIndexOf('/') + 1);
    const res = await cachedFetch(url);
    if (!res.ok) throw new Error(`porsche fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Promise((resolve, reject) => {
      beginLoad('gltf:parse', PORSCHE_GLB_TAG);
      loader.parse(
        buf,
        dir,
        (gltf) => {
          const t0 = performance.now();
          const root = gltf.scene || gltf.scenes[0];
          this.setupModel(root);
          loadMark('gltf:parse', PORSCHE_GLB_TAG, performance.now() - t0);
          resolve();
        },
        reject
      );
    });
  }

  setupModel(sceneRoot) {
    // Keep placeholder parented — hide it; HUD can toggle back without recreate.
    if (this._placeholder) this._placeholder.visible = false;

    const model = sceneRoot;
    const boundingBox = new THREE.Box3().setFromObject(model);
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());

    // Center geometry on local origin BEFORE scale/rotate so scale does not drift
    // the Sketchfab FBX pivot (bbox center is far from node origin).
    model.position.set(-center.x, -center.y, -center.z);

    const wrap = new THREE.Group();
    wrap.name = 'porsche-gltf';
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
    wrap.position.y = PORSCHE_ROOT_OFFSET_Y;
    wrap.updateMatrixWorld(true);

    const wheelObjects = this.discoverWheelObjects(wrap);
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

    const measured = wheelObjects
      .map((w) => ({ ...w, x: w.worldCenter.x, z: w.worldCenter.z }))
      .filter((w) => w.object);

    measured.sort((a, b) => b.z - a.z);
    const frontPair = measured.slice(0, 2);
    const rearPair = measured.slice(2);
    const pick = (pair, wantRight) =>
      pair.slice().sort((a, b) => a.x - b.x)[wantRight ? 1 : 0];

    this.wheelPivots = {
      frontLeft:  this.createWheelPivot(pick(frontPair, false), true, false),
      frontRight: this.createWheelPivot(pick(frontPair, true),  true, true),
      rearLeft:   this.createWheelPivot(pick(rearPair, false),  false, false),
      rearRight:  this.createWheelPivot(pick(rearPair, true),   false, true)
    };

    // Keep Source materials + maps (textures first; optimize later).
    // Still drop tiny badges/emblems that only add noise.
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

    this.chassisGroup.add(wrap);
    this._gltfRoot = wrap;
    this.ready = true;
    this._visualMode = 'porsche';
    wrap.visible = true;
    if (this._defender) this._defender.visible = false;
  }

  /**
   * Resolve four corner wheel Object3Ds.
   * Prefers legacy named nodes; otherwise splits merged tire/rim meshes by
   * world XZ clusters (Sketchfab porsche_911_with_interior.glb).
   */
  discoverWheelObjects(wrap) {
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

    return this.splitMergedWheels(wrap);
  }

  /**
   * Sketchfab export packs all four tires (and rims/discs) into single meshes.
   * Cluster tire verts in XZ, split spin meshes into four corner groups.
   */
  splitMergedWheels(wrap) {
    let tireMesh = null;
    wrap.traverse((obj) => {
      if (tireMesh || !obj.isMesh) return;
      if (/tires/i.test(obj.name) || /^AO_tire_main/i.test(obj.name)) {
        tireMesh = obj;
      }
    });
    if (!tireMesh?.geometry?.attributes?.position) return [];

    const worldCenters = clusterFourXZ(tireMesh);
    if (worldCenters.length < 4) return [];

    const spinMeshes = [];
    wrap.traverse((obj) => {
      if (!obj.isMesh) return;
      if (MERGED_SPIN_RE.test(obj.name)) spinMeshes.push(obj);
    });

    const groups = worldCenters.map((wc, i) => {
      const g = new THREE.Group();
      g.name = `wheel_split_${i}`;
      // Place group in wrap-local space at the cluster center.
      const local = wc.clone();
      wrap.worldToLocal(local);
      g.position.copy(local);
      wrap.add(g);
      return g;
    });

    for (const mesh of spinMeshes) {
      const geos = splitMeshByWorldCenters(mesh, worldCenters);
      const mat = mesh.material;
      for (let i = 0; i < 4; i++) {
        if (!geos[i]) continue;
        // Geometry was baked into wrap-local space; shift into group space.
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
        part.name = `${mesh.name}__${i}`;
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

    // Steer pivot (rotates on Y for steering)
    const steerPivot = new THREE.Group();
    steerPivot.position.copy(originalPosition);
    parent.add(steerPivot);

    // Spin pivot (rotates on X for rolling)
    const spinPivot = new THREE.Group();
    steerPivot.add(spinPivot);

    // Re-parent wheel into spin pivot
    wheelObject.position.set(0, 0, 0);
    spinPivot.add(wheelObject);

    // Re-parent hub into steer pivot (legacy models only)
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

  getVisualMode() {
    return this._visualMode;
  }

  /**
   * Show one of: loaded glTF, procedural Defender, or crude box.
   * @param {'porsche'|'defender'|'box'} mode
   */
  setVisualMode(mode) {
    if (mode === 'porsche') {
      if (!this.ready || !this._gltfRoot) {
        // Stay on box until glTF is ready.
        this._applyVisibility('box');
        return;
      }
      this._applyVisibility('porsche');
      return;
    }

    if (mode === 'defender') {
      this.attachDefender();
      this._applyVisibility('defender');
      return;
    }

    // mode === 'box'
    if (!this._placeholder) this.attachPlaceholder();
    this._applyVisibility('box');
  }

  /** @param {'porsche'|'defender'|'box'} mode */
  _applyVisibility(mode) {
    this._visualMode = mode;
    if (this._gltfRoot) this._gltfRoot.visible = mode === 'porsche';
    if (this._defender) this._defender.visible = mode === 'defender';
    if (this._placeholder) this._placeholder.visible = mode === 'box';
    else if (mode === 'box') this.attachPlaceholder();
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
function splitMeshByWorldCenters(mesh, worldCenters) {
  const geometry = mesh.geometry;
  const srcPos = geometry.attributes.position;
  if (!srcPos) return [null, null, null, null];

  // Walk up to the porsche-gltf wrap so we can bake into wrap-local space.
  let wrap = mesh.parent;
  while (wrap && wrap.name !== 'porsche-gltf') wrap = wrap.parent;
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
