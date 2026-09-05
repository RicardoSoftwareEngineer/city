/**
 * PorscheModel — Loads the Porsche 911 GLTF and sets up wheel pivot groups
 * for visual steering and spin animation.
 *
 * The model is scaled to PORSCHE_TARGET_LENGTH and centered.
 * Wheel nodes are re-parented into steer → spin pivot hierarchies so that
 * VehicleController can rotate them independently.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beginLoad, loadMark } from '../engine/loadLog.js';
import {
  PORSCHE_TARGET_LENGTH,
  PORSCHE_ROOT_OFFSET_Y
} from '../world/RoadDimensions.js';

// Wheel and hub node names inside porsche.glb (no dots — Godot export names)
const WHEEL_PARTS = [
  { wheel: 'wheel_lrchild001_6', hub: 'hub_lr_2' },
  { wheel: 'wheel_lrchild003_8', hub: 'hub_rr_1' },
  { wheel: 'wheel_lrchild_5',    hub: 'hub_lf_3' },
  { wheel: 'wheel_lrchild002_7', hub: 'hub_rf_4' }
];

export class PorscheModel {
  constructor() {
    this.chassisGroup = new THREE.Group();  // The group added to the scene
    this.wheelPivots = {};                  // { frontLeft: { steerPivot, spinPivot, isFront }, ... }
    this._placeholder = null;
    this.ready = false;
  }

  /**
   * Cheap stand-in so GameLoop can start before the glTF finishes.
   * Cleared automatically when setupModel runs.
   */
  attachPlaceholder() {
    if (this._placeholder || this.ready) return;
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
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load('/models/porsche/porsche.glb', (gltf) => {
        beginLoad('gltf:parse', 'porsche.glb');
        const t0 = performance.now();
        const root = gltf.scene || gltf.scenes[0];
        this.setupModel(root);
        loadMark('gltf:parse', 'porsche.glb', performance.now() - t0);
        resolve();
      }, undefined, reject);
    });
  }

  setupModel(root) {
    this.clearPlaceholder();
    // Measure and center
    const boundingBox = new THREE.Box3().setFromObject(root);
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());

    root.position.x -= center.x;
    root.position.y = PORSCHE_ROOT_OFFSET_Y;
    root.position.z -= center.z;

    // Scale to target length
    const currentLength = Math.max(size.z, size.x);
    const scale = PORSCHE_TARGET_LENGTH / currentLength;
    root.scale.set(scale, scale, scale);

    // Orient correctly (faces +Z forward)
    if (size.x > size.z) {
      root.rotation.y = -Math.PI / 2;
    } else {
      root.rotation.y = Math.PI;
    }

    // After orientation, pick front/rear by world Z (+Z = forward), not GLB names.
    root.updateMatrixWorld(true);
    const measured = WHEEL_PARTS.map((part) => {
      const wheelObject = root.getObjectByName(part.wheel);
      const pos = new THREE.Vector3();
      if (wheelObject) wheelObject.getWorldPosition(pos);
      return { ...part, x: pos.x, z: pos.z };
    }).filter((part) => root.getObjectByName(part.wheel));

    measured.sort((a, b) => b.z - a.z);
    const frontPair = measured.slice(0, 2);
    const rearPair = measured.slice(2);
    const pick = (pair, wantRight) =>
      pair.slice().sort((a, b) => a.x - b.x)[wantRight ? 1 : 0];

    this.wheelPivots = {
      frontLeft:  this.createWheelPivot(root, pick(frontPair, false), true, false),
      frontRight: this.createWheelPivot(root, pick(frontPair, true),  true, true),
      rearLeft:   this.createWheelPivot(root, pick(rearPair, false),  false, false),
      rearRight:  this.createWheelPivot(root, pick(rearPair, true),   false, true)
    };

    // Keep Source materials + maps (textures first; optimize later).
    // Still drop tiny badges/emblems that only add noise.
    const drop = [];
    root.traverse((child) => {
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

    this.chassisGroup.add(root);
    this.ready = true;
  }

  /**
   * Create steer → spin pivot hierarchy for a single wheel.
   */
  createWheelPivot(root, nodeNames, isFront, isRight) {
    const wheelObject = root.getObjectByName(nodeNames.wheel);
    const hubObject = nodeNames.hub ? root.getObjectByName(nodeNames.hub) : null;
    if (!wheelObject) return null;

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

    // Re-parent hub into steer pivot
    if (hubObject) {
      hubObject.position.x -= originalPosition.x;
      hubObject.position.y -= originalPosition.y;
      hubObject.position.z -= originalPosition.z;
      steerPivot.add(hubObject);
    }

    return { steerPivot, spinPivot, isFront, isRight };
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
