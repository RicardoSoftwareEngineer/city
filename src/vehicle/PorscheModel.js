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
  }

  /**
   * Load the Porsche GLB and return when ready.
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

    // Enable shadows
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.chassisGroup.add(root);
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
   * Update visual wheel rotation and steering each frame.
   */
  updateWheels(steerAngle, spinAngle) {
    for (const pivot of Object.values(this.wheelPivots)) {
      if (!pivot) continue;

      if (pivot.isFront && pivot.steerPivot) {
        pivot.steerPivot.rotation.y = steerAngle;
      }
      if (pivot.spinPivot) {
        pivot.spinPivot.rotation.x = pivot.isRight ? -spinAngle : spinAngle;
      }
    }
  }
}
