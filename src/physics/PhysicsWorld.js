/**
 * PhysicsWorld — Cannon-es physics simulation.
 *
 * Creates the CANNON.World with gravity, broadphase, and a static ground
 * box whose top surface sits exactly at ASPHALT_SURFACE_Y (-0.150 m).
 */

import * as CANNON from 'cannon-es';
import {
  ASPHALT_SURFACE_Y,
  GROUND_BODY_HALF,
  GROUND_BODY_DEPTH
} from '../world/RoadDimensions.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.friction = 0.3;

    this.createGroundPlane();
  }

  createGroundPlane() {
    const shape = new CANNON.Box(
      new CANNON.Vec3(GROUND_BODY_HALF, GROUND_BODY_DEPTH, GROUND_BODY_HALF)
    );
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      position: new CANNON.Vec3(0, ASPHALT_SURFACE_Y - GROUND_BODY_DEPTH, 0),
      material: new CANNON.Material('ground')
    });
    this.world.addBody(body);
  }

  /**
   * Add a static box collider (used for buildings, walls, etc).
   */
  addStaticBox(x, y, z, halfWidth, halfHeight, halfDepth) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfWidth, halfHeight, halfDepth)),
      position: new CANNON.Vec3(x, y + halfHeight, z)
    });
    this.world.addBody(body);
  }

  step(delta) {
    this.world.step(1 / 60, delta, 3);
  }
}
